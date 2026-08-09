import { removeDomainRecords, syncDomainRecords } from './dnsProvider'
import { portalRelay } from './relay'
import { hasClaimed } from './nodeClaims'
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
  if (!hasClaimed(node, request.clientId)) {
    throw new Error('Adopt this node before allocating addresses on it.')
  }

  /**
   * The requested target port must be one this node has offered.
   *
   * Without this a control plane could ask Portal to publish any port on a
   * node it had claimed — `targetPort` arrives in the request body and used to
   * be taken at face value, so the call that publishes a Minecraft server
   * would equally have published a database or an SSH daemon on the same host.
   *
   * A node that has registered nothing is exempt, because every node that
   * predates endpoint registration is in that state and refusing them all
   * would break every existing server on the next allocation. Once a node
   * declares anything, it is held to its own list.
   */
  if (node.endpoints && node.endpoints.length > 0) {
    const offered = node.endpoints.some((endpoint) => endpoint.localPort === request.targetPort)
    if (!offered) {
      throw new Error(
        `That node has not offered port ${request.targetPort}. Only ports Chunkforge runs a service on can be published.`
      )
    }
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
  // Best-effort: a Cloudflare hiccup should not fail the allocation, since the
  // hostname and route are already live and the admin UI still reports the
  // records to publish by hand as a fallback.
  await syncDomainRecords(domain).catch((err: Error) => {
    console.error(`Could not publish DNS for ${domain.hostname}: ${err.message}`)
  })
  return domain
}

export async function releaseDomain(hostname: string, clientId: string): Promise<void> {
  const domain = portalStore.findDomain(hostname)
  if (!domain) return
  if (domain.clientId !== clientId) throw new Error('That domain belongs to another control plane.')
  await removeDomainRecords(domain).catch((err: Error) => {
    console.error(`Could not remove DNS for ${domain.hostname}: ${err.message}`)
  })
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

/**
 * Moves a server's address to a new label in the same zone.
 *
 * This is a release-and-reallocate rather than an in-place edit on purpose:
 * the hostname is the DNS key everywhere it is used — the tunnel id, the
 * Cloudflare record, a player's saved server entry — and changing it half way
 * is how you end up with an orphaned tunnel bound to a name nothing points at
 * anymore. Doing it as one remove-then-add keeps every one of those in sync
 * with the single new name.
 */
export async function renameDomain(
  hostname: string,
  clientId: string,
  newLabel: string
): Promise<PortalDomain> {
  const domain = portalStore.findDomain(hostname)
  if (!domain) throw new Error('Unknown subdomain.')
  if (domain.clientId !== clientId) throw new Error('That domain belongs to another control plane.')

  const config = portalStore.config()
  const zone = normalizeZone(config.zoneSuffix)
  if (!zone) throw new Error('Portal has no domain zone configured.')

  const label = toDnsLabel(newLabel)
  if (!label) throw new Error('That name has no usable characters for a subdomain.')
  const nextHostname = `${label}.${zone}`
  if (nextHostname === domain.hostname) return domain

  const clash = portalStore.domains().find((entry) => entry.hostname === nextHostname)
  if (clash) throw new Error(`${nextHostname} is already taken.`)

  // Same port and route, new name — a rename must not disturb who a player
  // was already connecting to on the port, only what they type to get there.
  const renamed: PortalDomain = {
    ...domain,
    hostname: nextHostname,
    label,
    createdAt: domain.createdAt
  }

  await removeDomainRecords(domain).catch((err: Error) => {
    console.error(`Could not remove DNS for ${domain.hostname}: ${err.message}`)
  })
  await portalStore.removeDomain(domain.hostname)

  const node = portalStore.findNode(domain.nodeId)
  if (node) {
    node.tunnels = node.tunnels.filter((tunnel) => tunnel.id !== domainTunnelId(domain.hostname))
    await portalStore.upsertNode(node)
  }

  await portalStore.upsertDomain(renamed)
  if (node) await bindDomainTunnel(node, renamed)
  await syncDomainRecords(renamed).catch((err: Error) => {
    console.error(`Could not publish DNS for ${renamed.hostname}: ${err.message}`)
  })

  return renamed
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
  const free: number[] = []
  for (let port = config.publicPortRangeStart; port <= config.publicPortRangeEnd; port += 1) {
    if (!used.has(port)) free.push(port)
  }
  if (free.length === 0) throw new Error('No public ports left in the configured range.')
  // Picked at random rather than lowest-first. The port is an implementation
  // detail players never type — an SRV record carries it — so there is nothing
  // to gain from predictability, and spreading allocations means deleting and
  // recreating a server is far less likely to hand it the port a player's
  // client still has cached for the server that used to be there.
  return free[Math.floor(Math.random() * free.length)]
}

function assertPortFree(port: number, existing: PortalDomain | undefined): void {
  const clash = portalStore
    .domains()
    .find((domain) => domain.publicPort === port && domain.hostname !== existing?.hostname)
  if (clash) throw new Error(`Public port ${port} is already used by ${clash.hostname}.`)
}

export interface LabelAvailability {
  /** The label after DNS normalisation — what would actually be registered. */
  label: string
  hostname: string
  available: boolean
  /** Why it cannot be used, when it cannot. */
  reason?: string
  /** A free alternative, offered only when the request is taken. */
  suggestion?: string
}

/**
 * Whether a subdomain label can be used, before anything is committed.
 *
 * Allocation quietly falls back to `name-2` when `name` is taken, which is the
 * right behaviour for an automatic allocation during server creation but a
 * poor surprise for someone who deliberately typed a name. This lets the UI
 * say so up front, and offer the suffix as a choice rather than a fait
 * accompli.
 *
 * A domain the asking control plane already owns for this same instance counts
 * as available: re-submitting the name a server already has is not a clash.
 */
export function checkLabelAvailability(
  rawLabel: string,
  options?: { instanceId?: string; clientId?: string }
): LabelAvailability {
  const zone = normalizeZone(portalStore.config().zoneSuffix)
  const label = toDnsLabel(rawLabel)

  if (!zone) {
    return { label, hostname: '', available: false, reason: 'Portal has no domain zone configured.' }
  }
  if (!label) {
    return {
      label,
      hostname: '',
      available: false,
      reason: 'That name has no usable characters for a subdomain.'
    }
  }

  const hostname = `${label}.${zone}`
  const existing = portalStore.findDomain(hostname)
  if (!existing) return { label, hostname, available: true }

  const isOwnedByCaller =
    Boolean(options?.instanceId) && existing.instanceId === options?.instanceId &&
    (!options?.clientId || existing.clientId === options.clientId)
  if (isOwnedByCaller) return { label, hostname, available: true }

  const taken = new Set(portalStore.domains().map((domain) => domain.hostname))
  return {
    label,
    hostname,
    available: false,
    reason: 'That subdomain is already in use.',
    suggestion: nextFreeHostname(label, zone, taken).slice(0, -(zone.length + 1))
  }
}
