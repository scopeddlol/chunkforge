import { portalRelay } from './relay'
import { portalStore } from './store'
import type { PortalDomain, PortalNode, PortalTunnel, TunnelProtocol } from './types'

export interface AllocateDomainRequest {
  clientId: string
  nodeId: string
  /** Preferred label. Derived from `name` when omitted. */
  label?: string
  /** Human name to derive a label from, e.g. the server's display name. */
  name?: string
  instanceId?: string
  protocol?: TunnelProtocol
  /** Port on the node the server actually listens on. */
  targetPort: number
  /**
   * Public port to accept traffic on. Omit to let Portal pick one from the
   * configured range; required when auto-allocation is switched off.
   */
  publicPort?: number
}

export function normalizeZone(suffix: string): string {
  return suffix.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
}

/** Squeezes any display name into something that can be a DNS label. */
export function toDnsLabel(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Hands out a subdomain and wires the route behind it.
 *
 * This is the piece that makes Portal a subdomain manager rather than a plain
 * reverse proxy: the caller asks for a *name*, and gets back a hostname, a
 * public port, and a live tunnel to the node that serves it. The control plane
 * never picks a port and never touches the relay.
 */
export async function allocateDomain(request: AllocateDomainRequest): Promise<PortalDomain> {
  const config = portalStore.config()
  const zone = normalizeZone(config.zoneSuffix)
  if (!zone) throw new Error('Portal has no domain zone configured.')

  const node = portalStore.findNode(request.nodeId)
  if (!node) throw new Error('Unknown node.')
  // Claiming is what authorises a control plane to use a node at all. Allowing
  // an *unclaimed* node here would let anyone paired with a shared Portal open
  // public routes onto a machine they do not manage.
  if (node.claimedByClientId !== request.clientId) {
    throw new Error(
      node.claimedByClientId
        ? 'That node is claimed by another Chunkforge control plane.'
        : 'Adopt this node before allocating addresses on it.'
    )
  }

  const protocol: TunnelProtocol = request.protocol ?? 'tcp'
  const base =
    toDnsLabel(request.label ?? request.name ?? '') || `server-${request.nodeId.slice(0, 6)}`
  const existingForInstance = request.instanceId
    ? portalStore
        .domains()
        .find((domain) => domain.instanceId === request.instanceId && domain.clientId === request.clientId)
    : undefined

  const taken = new Set(
    portalStore
      .domains()
      .filter((domain) => domain.hostname !== existingForInstance?.hostname)
      .map((domain) => domain.hostname)
  )
  const hostname = existingForInstance
    ? existingForInstance.hostname
    : nextFreeHostname(base, zone, taken)

  const publicPort = resolvePublicPort(request, existingForInstance)

  const domain: PortalDomain = {
    hostname,
    label: hostname.slice(0, hostname.length - zone.length - 1),
    nodeId: request.nodeId,
    clientId: request.clientId,
    instanceId: request.instanceId,
    protocol,
    targetPort: request.targetPort,
    publicPort,
    createdAt: existingForInstance?.createdAt ?? new Date().toISOString()
  }

  await portalStore.upsertDomain(domain)
  await bindDomainTunnel(node, domain)
  return domain
}

export async function releaseDomain(hostname: string, clientId: string): Promise<void> {
  const domain = portalStore.findDomain(hostname)
  if (!domain) return
  if (domain.clientId !== clientId) throw new Error('That domain belongs to another control plane.')
  await portalStore.removeDomain(domain.hostname)

  const node = portalStore.findNode(domain.nodeId)
  if (!node) return
  node.tunnels = node.tunnels.filter((tunnel) => tunnel.id !== domainTunnelId(domain.hostname))
  await portalStore.upsertNode(node)
  if (portalRelay.isNodeConnected(node.id)) {
    await portalRelay.syncNodeTunnels(node.id, node.tunnels)
  }
}

/** Every domain a control plane owns, newest last. */
export function listDomainsForClient(clientId: string): PortalDomain[] {
  return portalStore.domains().filter((domain) => domain.clientId === clientId)
}

function domainTunnelId(hostname: string): string {
  return `domain:${hostname}`
}

/**
 * Adds (or refreshes) the tunnel a domain resolves to and pushes it to the
 * relay. If the node is offline the record still lands, and the tunnel opens on
 * its next reconnect — allocating a hostname for a node that is briefly down
 * should not fail.
 */
async function bindDomainTunnel(node: PortalNode, domain: PortalDomain): Promise<void> {
  const tunnel: PortalTunnel = {
    id: domainTunnelId(domain.hostname),
    label: domain.hostname,
    protocol: domain.protocol,
    targetPort: domain.targetPort,
    publicPort: domain.publicPort,
    enabled: true
  }
  const index = node.tunnels.findIndex((entry) => entry.id === tunnel.id)
  if (index >= 0) node.tunnels[index] = tunnel
  else node.tunnels.push(tunnel)
  await portalStore.upsertNode(node)

  if (portalRelay.isNodeConnected(node.id)) {
    await portalRelay.syncNodeTunnels(node.id, node.tunnels)
  }
}

function nextFreeHostname(base: string, zone: string, taken: Set<string>): string {
  let candidate = `${base}.${zone}`
  let attempt = 2
  while (taken.has(candidate)) {
    candidate = `${base}-${attempt}.${zone}`
    attempt += 1
  }
  return candidate
}

function resolvePublicPort(
  request: AllocateDomainRequest,
  existing: PortalDomain | undefined
): number {
  const config = portalStore.config()

  if (request.publicPort) {
    assertPortFree(request.publicPort, existing)
    return request.publicPort
  }
  // Re-allocating for an instance that already has a hostname keeps its port,
  // so a player's saved server entry does not break on a rename.
  if (existing) return existing.publicPort

  if (!config.autoAllocatePorts) {
    throw new Error('Automatic port allocation is off — specify a public port.')
  }

  const used = new Set<number>([
    ...portalStore.domains().map((domain) => domain.publicPort),
    ...portalRelay.boundPublicPorts()
  ])
  for (let port = config.publicPortRangeStart; port <= config.publicPortRangeEnd; port += 1) {
    if (!used.has(port)) return port
  }
  throw new Error('No public ports left in the configured range.')
}

function assertPortFree(port: number, existing: PortalDomain | undefined): void {
  const clash = portalStore
    .domains()
    .find((domain) => domain.publicPort === port && domain.hostname !== existing?.hostname)
  if (clash) throw new Error(`Public port ${port} is already used by ${clash.hostname}.`)
}
