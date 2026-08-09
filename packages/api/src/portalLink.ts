import {
  bindInstanceHostname,
  clearPortalLink,
  getLocalNode,
  getPortalStatus,
  isPortalLinked,
  requirePortalLink,
  savePortalStatus,
  unbindInstanceHostname,
  type InstanceMetadata,
  type Node,
  type PortalDomainBinding,
  type PortalSettings
} from '@chunkforge/core'
import { PortalClient, type PortalInventoryView } from '@chunkforge/portal/client'
import type { LabelAvailability } from '@chunkforge/portal/domains'
import { localNodeId } from './localNode'
import { startPortalEventRelay, stopPortalEventRelay } from './portalEvents'

/**
 * This Chunkforge's link to its Portal.
 *
 * Everything a control plane needs from a Portal goes through here: pairing,
 * discovering nodes, claiming one, allocating a subdomain for a server, and
 * forwarding management calls to a node that has no open ports of its own.
 *
 * It is intentionally the *only* place that knows a Portal exists. The routes
 * above it and the domain layer below it both stay unaware, so an install that
 * never pairs with a Portal behaves exactly as it did before Portals existed.
 */

function clientFor(portal: PortalSettings): PortalClient {
  return new PortalClient({ baseUrl: portal.portalUrl, token: portal.clientToken })
}

/**
 * Records a domain binding on whichever machine actually holds that server's
 * metadata.
 *
 * A local server's record lives in this Core's own instance index, so
 * `bindInstanceHostname` writes it directly. A remote server's record lives on
 * its node — this Core never has a local metadata file for it at all — so the
 * write has to go over the wire as a plain `PATCH /api/servers/:id`, the same
 * route the node already serves for every other field. Calling
 * `bindInstanceHostname` for a remote id would throw `Unknown instance`,
 * which used to escape all the way to the user as the allocation failing.
 */
async function applyDomainBinding(
  instance: Pick<InstanceMetadata, 'id'> & { nodeId?: string | null },
  hostname: string,
  publicPort: number
): Promise<void> {
  if (instance.nodeId && instance.nodeId !== 'local') {
    await callNodeAgent(instance.nodeId, 'PATCH', `/api/servers/${encodeURIComponent(instance.id)}`, {
      portalHostname: hostname,
      portalPublicPort: publicPort
    }).catch(() => undefined)
    return
  }
  await bindInstanceHostname(instance.id, hostname, publicPort).catch(() => undefined)
}

async function clearDomainBinding(
  instance: Pick<InstanceMetadata, 'id'> & { nodeId?: string | null }
): Promise<void> {
  if (instance.nodeId && instance.nodeId !== 'local') {
    await callNodeAgent(instance.nodeId, 'PATCH', `/api/servers/${encodeURIComponent(instance.id)}`, {
      portalHostname: null,
      portalPublicPort: null
    }).catch(() => undefined)
    return
  }
  await unbindInstanceHostname(instance.id).catch(() => undefined)
}

/** Redeems a control-plane pin, storing the token Portal issues back. */
export async function connectToPortal(
  portalUrl: string,
  pin: string,
  name: string,
  kind: 'desktop' | 'web'
): Promise<PortalSettings> {
  const trimmed = portalUrl.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('Enter the Portal URL first.')

  await savePortalStatus({ portalUrl: trimmed, connectionStatus: 'connecting', lastError: undefined })
  try {
    const redeemed = await new PortalClient({ baseUrl: trimmed }).client.redeem(pin, name, kind)
    const status = await savePortalStatus({
      enabled: true,
      portalUrl: trimmed,
      clientId: redeemed.clientId,
      clientToken: redeemed.clientToken,
      zoneSuffix: redeemed.zoneSuffix,
      connectionStatus: 'connected',
      connectedAt: new Date().toISOString(),
      lastError: undefined
    })
    // Live events from any node this control plane later claims arrive over
    // this same link, so it opens the moment pairing succeeds rather than
    // waiting for the first node to be adopted.
    startPortalEventRelay()
    return status
  } catch (err) {
    const message = (err as Error).message
    await savePortalStatus({ connectionStatus: 'disconnected', lastError: message })
    throw new Error(`Could not pair with Portal: ${message}`)
  }
}

export async function disconnectFromPortal(): Promise<PortalSettings> {
  stopPortalEventRelay()
  return clearPortalLink()
}

/**
 * Re-checks the link and refreshes the mirrored zone. Called when the UI opens
 * the Portal panel, so a Portal whose zone changed does not leave Chunkforge
 * quoting a stale address.
 */
export async function refreshPortalStatus(): Promise<PortalSettings> {
  const portal = getPortalStatus()
  if (!isPortalLinked()) return portal
  try {
    const status = await clientFor(portal).client.status()
    return await savePortalStatus({
      zoneSuffix: status.zoneSuffix,
      connectionStatus: 'connected',
      lastError: undefined
    })
  } catch (err) {
    return savePortalStatus({ connectionStatus: 'disconnected', lastError: (err as Error).message })
  }
}

/**
 * Every node this Chunkforge can see: the machine it runs on, plus whatever
 * Portal knows about. A Portal that is unreachable degrades to just the local
 * node rather than failing the request — the local machine still works when the
 * VPS is down, and the dashboard should say so rather than break.
 */
export async function listAllNodes(): Promise<Node[]> {
  const local = getLocalNode()
  if (!isPortalLinked()) return [local]

  try {
    const remote = await clientFor(getPortalStatus()).client.nodes()
    return [
      local,
      ...remote.map<Node>((node) => ({
        id: node.id,
        name: node.name,
        kind: 'portal',
        status: node.status,
        stats: node.stats,
        lastSeenAt: node.lastSeenAt,
        pairedAt: node.pairedAt,
        portalNodeId: node.id,
        agentReady: node.agentReady,
        claimed: node.claimed,
        claimedByOther: node.claimedByOther,
        claimantCount: node.claimantCount,
        tunnels: node.tunnels
      }))
    ]
  } catch {
    return [local]
  }
}

/** Asks Portal what every linked control plane is running. */
export async function fetchPortalInventory(): Promise<PortalInventoryView> {
  return clientFor(requirePortalLink()).client.inventory()
}

export async function claimPortalNode(nodeId: string): Promise<void> {
  await clientFor(requirePortalLink()).client.claimNode(nodeId)
}

export async function releasePortalNode(nodeId: string): Promise<void> {
  await clientFor(requirePortalLink()).client.releaseNode(nodeId)
}

/**
 * Asks Portal for an address for a server and records what came back.
 *
 * This runs on every server creation when auto-provisioning is on, which is
 * what makes "every server has a subdomain" true by construction rather than by
 * remembering to do it. A failure here is reported but never fails the
 * creation — a server without a public name is still a working server, and
 * losing the whole install because a VPS was rebooting would be far worse.
 */
export async function provisionInstanceDomain(
  instance: InstanceMetadata,
  options?: { force?: boolean; label?: string }
): Promise<PortalDomainBinding | null> {
  const portal = getPortalStatus()
  if (!isPortalLinked()) return null
  if (!portal.autoProvisionSubdomains && !options?.force) return null
  if (instance.portalHostname && !options?.force) return null

  // A local server can have an address too, as long as this machine is
  // registered with Portal as a node — that registration is what gives Portal
  // a socket to relay players down. Without it there is genuinely nowhere to
  // route to, so there is nothing to allocate.
  const nodeId =
    instance.nodeId && instance.nodeId !== 'local' ? instance.nodeId : localNodeId()
  if (!nodeId) return null

  const allocated = await clientFor(portal).client.allocateDomain({
    nodeId,
    // The requested label wins when the caller has one — Portal only falls
    // back to the server's display name when the wizard did not ask for a
    // specific address.
    label: options?.label?.trim() || undefined,
    name: instance.name,
    instanceId: instance.id,
    protocol: 'tcp',
    targetPort: instance.port
  })
  await applyDomainBinding(instance, allocated.hostname, allocated.publicPort)
  return {
    hostname: allocated.hostname,
    nodeId: allocated.nodeId,
    instanceId: allocated.instanceId,
    protocol: allocated.protocol,
    targetPort: allocated.targetPort,
    publicPort: allocated.publicPort,
    dnsRecords: allocated.dnsRecords
  }
}

/**
 * Gives a server's subdomain back to Portal.
 *
 * A local server knows its own hostname; a remote one does not, because its
 * record lives on the node. So when the hostname is unknown it is looked up by
 * instance id, which Portal stamped on the domain when it allocated it.
 */
export async function releaseInstanceDomain(
  instance: Pick<InstanceMetadata, 'id' | 'portalHostname'> & { nodeId?: string | null }
): Promise<void> {
  if (!isPortalLinked()) return
  const client = clientFor(getPortalStatus())

  let hostname = instance.portalHostname
  if (!hostname) {
    try {
      const domains = await client.client.domains()
      hostname = domains.find((domain) => domain.instanceId === instance.id)?.hostname
    } catch {
      return
    }
  }
  if (!hostname) return

  try {
    await client.client.releaseDomain(hostname)
  } catch {
    // The server is going away either way. Refusing to delete it because a DNS
    // record could not be released would strand the user; an operator can prune
    // a leftover record from Portal's own Subdomains page.
  }
  await clearDomainBinding(instance)
}

/**
 * Moves a server's address to a new subdomain label, keeping its public port —
 * a rename must not silently move where players who already have the server
 * saved end up connecting.
 */
export async function renameInstanceDomain(
  instance: Pick<InstanceMetadata, 'id' | 'portalHostname'> & { nodeId?: string | null },
  label: string
): Promise<PortalDomainBinding> {
  const client = clientFor(requirePortalLink())

  let hostname = instance.portalHostname
  if (!hostname) {
    const domains = await client.client.domains()
    hostname = domains.find((domain) => domain.instanceId === instance.id)?.hostname
  }
  if (!hostname) throw new Error('This server has no address to rename yet.')

  const renamed = await client.client.renameDomain(hostname, label)
  await applyDomainBinding(instance, renamed.hostname, renamed.publicPort)
  return {
    hostname: renamed.hostname,
    nodeId: renamed.nodeId,
    instanceId: renamed.instanceId,
    protocol: renamed.protocol,
    targetPort: renamed.targetPort,
    publicPort: renamed.publicPort,
    dnsRecords: renamed.dnsRecords
  }
}

/**
 * Asks Portal whether a subdomain is free. Returns null when there is no
 * Portal to ask, which the UI reads as "nothing to check" rather than an error.
 */
export async function checkDomainLabel(
  label: string,
  instanceId?: string
): Promise<LabelAvailability | null> {
  if (!isPortalLinked()) return null
  return clientFor(getPortalStatus()).client.checkDomain(label, instanceId)
}

export async function listPortalDomains(): Promise<PortalDomainBinding[]> {
  if (!isPortalLinked()) return []
  const domains = await clientFor(getPortalStatus()).client.domains()
  return domains.map((domain) => ({
    hostname: domain.hostname,
    nodeId: domain.nodeId,
    instanceId: domain.instanceId,
    protocol: domain.protocol,
    targetPort: domain.targetPort,
    publicPort: domain.publicPort,
    dnsRecords: domain.dnsRecords
  }))
}

/**
 * Forwards a Chunkforge API call to a remote node through Portal.
 *
 * The path is the same one the UI uses locally — `/api/servers`, `/api/stats`,
 * anything — so managing a node in another country is the same code path as
 * managing this one, with a different base.
 */
export async function callNodeAgent(
  nodeId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  return clientFor(requirePortalLink()).client.agent(nodeId, method, path, body)
}
