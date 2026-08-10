import { randomUUID } from 'crypto'
import { dnsRecordsForEndpoint, portalPublicHost, type DnsRecord } from './dns'
import { removeEndpointRecords, syncEndpointRecords } from './dnsProvider'
import { normalizeZone, toDnsLabel } from './domains'
import { portalRelay } from './relay'
import { portalStore } from './store'
import type { PortalTunnel, TunnelProtocol } from './types'

/**
 * Public mappings for the endpoints a node has registered.
 *
 * The game port already had this, under `domains`. Everything else a server
 * exposes — voice chat, a map, a custom service — goes through here, and the
 * two differ in one respect: a domain is one hostname per *server*, while an
 * endpoint is one mapping per *service*, several of which can belong to the
 * same server.
 *
 * Every allocation is checked against what the node itself declared. That
 * check is the whole reason endpoint registration exists; see `NodeEndpoint`.
 */

export interface EndpointMapping {
  id: string
  clientId: string
  nodeId: string
  instanceId: string
  endpointId: string
  label: string
  protocol: TunnelProtocol | 'http'
  /** The port on the node. */
  targetPort: number
  /**
   * Where Portal listens.
   *
   * For tcp and udp this is the public port players connect to. For http it is
   * an internal port the HTTP proxy forwards to — nobody outside ever sees it,
   * because an http endpoint is reached by hostname on Portal's ordinary web
   * port instead.
   */
  publicPort: number
  /** Hostname this is served on. http only. */
  hostname?: string
  createdAt: string
}

/** A mapping plus the records that make its hostname resolve. */
export interface AllocatedEndpoint extends EndpointMapping {
  dnsRecords: DnsRecord[]
}

export function endpointTunnelId(mappingId: string): string {
  return `endpoint:${mappingId}`
}

/** Everything currently mapped, so allocation never double-books a port. */
function takenPublicPorts(): Set<number> {
  const ports = new Set<number>()
  for (const domain of portalStore.domains()) ports.add(domain.publicPort)
  for (const mapping of portalStore.endpointMappings()) ports.add(mapping.publicPort)
  for (const port of portalRelay.boundPublicPorts()) ports.add(port)
  return ports
}

function nextFreePublicPort(): number {
  const config = portalStore.config()
  const taken = takenPublicPorts()
  for (let port = config.publicPortRangeStart; port <= config.publicPortRangeEnd; port++) {
    if (!taken.has(port)) return port
  }
  throw new Error('Portal has no free public ports left in its configured range.')
}

export interface AllocateEndpointRequest {
  clientId: string
  nodeId: string
  instanceId: string
  /** The node's own id for this endpoint, so re-allocating updates in place. */
  endpointId: string
  label: string
  protocol: TunnelProtocol | 'http'
  targetPort: number
}

export async function allocateEndpoint(request: AllocateEndpointRequest): Promise<EndpointMapping> {
  const node = portalStore.findNode(request.nodeId)
  if (!node) throw new Error('Unknown node.')

  /**
   * The node must have offered this port.
   *
   * Identical in spirit to the check in `allocateDomain`, and for the same
   * reason: without it a control plane could name any port on a machine it has
   * claimed and have Portal publish it. Endpoints make that easier to attempt,
   * so the check is not optional here — a node that has registered nothing
   * cannot allocate endpoints at all, unlike the legacy domain path which has
   * existing servers to keep working.
   */
  const offered = (node.endpoints ?? []).find(
    (endpoint) => endpoint.id === request.endpointId && endpoint.localPort === request.targetPort
  )
  if (!offered) {
    throw new Error(
      `That node has not registered an endpoint ${request.endpointId} on port ${request.targetPort}.`
    )
  }

  const existing = portalStore
    .endpointMappings()
    .find(
      (mapping) => mapping.endpointId === request.endpointId && mapping.clientId === request.clientId
    )

  const publicPort = existing?.publicPort ?? nextFreePublicPort()

  let hostname = existing?.hostname
  if (request.protocol === 'http' && !hostname) {
    const zone = normalizeZone(portalStore.config().zoneSuffix)
    if (!zone) throw new Error('Portal has no domain zone configured, so it cannot serve HTTP endpoints.')
    const base = toDnsLabel(request.label) || 'service'
    const used = new Set(portalStore.endpointMappings().map((mapping) => mapping.hostname))
    let candidate = `${base}.${zone}`
    let suffix = 2
    while (used.has(candidate)) candidate = `${base}-${suffix++}.${zone}`
    hostname = candidate
  }

  const mapping: EndpointMapping = {
    id: existing?.id ?? randomUUID(),
    clientId: request.clientId,
    nodeId: request.nodeId,
    instanceId: request.instanceId,
    endpointId: request.endpointId,
    label: request.label,
    protocol: request.protocol,
    targetPort: request.targetPort,
    publicPort,
    hostname,
    createdAt: existing?.createdAt ?? new Date().toISOString()
  }

  /**
   * A mapping that has moved node leaves a tunnel behind.
   *
   * Re-allocating the same endpoint against a different node — which is what a
   * server migration does — updates the record and binds the new node, but the
   * old node kept its half of the route. The public port then relays to a
   * machine that no longer runs the service, which looks exactly like the
   * service being broken.
   */
  if (existing && existing.nodeId !== request.nodeId) {
    await unbindEndpointTunnel(existing.nodeId, existing.id)
  }

  await portalStore.upsertEndpointMapping(mapping)
  await bindEndpointTunnel(mapping)
  // Best-effort, exactly as for domains: the mapping and its route are already
  // live, and a DNS provider being briefly unreachable is not a reason to
  // refuse an allocation the operator can also publish by hand.
  await syncEndpointRecords(mapping).catch((err: Error) => {
    console.error(`Could not publish DNS for ${mapping.hostname ?? mapping.label}: ${err.message}`)
  })
  return mapping
}

/**
 * Opens the relay for a mapping.
 *
 * An http endpoint gets an ordinary TCP tunnel too — the HTTP proxy in front
 * of it simply connects to that port on Portal's own loopback. Reusing the
 * relay rather than inventing an HTTP-specific frame keeps one code path
 * carrying bytes, which is the part that has to be right.
 */
async function bindEndpointTunnel(mapping: EndpointMapping): Promise<void> {
  const node = portalStore.findNode(mapping.nodeId)
  if (!node) return
  const tunnel: PortalTunnel = {
    id: endpointTunnelId(mapping.id),
    label: mapping.label,
    protocol: mapping.protocol === 'udp' ? 'udp' : 'tcp',
    targetPort: mapping.targetPort,
    publicPort: mapping.publicPort,
    enabled: true
  }
  node.tunnels = [...node.tunnels.filter((existing) => existing.id !== tunnel.id), tunnel]
  await portalStore.upsertNode(node)
  if (portalRelay.isNodeConnected(node.id)) {
    await portalRelay.syncNodeTunnels(node.id, node.tunnels)
  }
}

/** Takes a node's half of a route away, wherever that route went next. */
async function unbindEndpointTunnel(nodeId: string, mappingId: string): Promise<void> {
  const node = portalStore.findNode(nodeId)
  if (!node) return
  node.tunnels = node.tunnels.filter((tunnel) => tunnel.id !== endpointTunnelId(mappingId))
  await portalStore.upsertNode(node)
  if (portalRelay.isNodeConnected(node.id)) {
    await portalRelay.syncNodeTunnels(node.id, node.tunnels)
  }
}

export async function releaseEndpoint(mappingId: string, clientId: string): Promise<void> {
  const mapping = portalStore.endpointMappings().find((entry) => entry.id === mappingId)
  if (!mapping) return
  if (mapping.clientId !== clientId) throw new Error('That endpoint belongs to another control plane.')

  await removeEndpointRecords(mapping).catch((err: Error) => {
    console.error(`Could not remove DNS for ${mapping.hostname ?? mapping.label}: ${err.message}`)
  })
  await portalStore.removeEndpointMapping(mappingId)
  await unbindEndpointTunnel(mapping.nodeId, mappingId)
}

/** Releases every mapping for a server, for when the server itself goes away. */
export async function releaseEndpointsForInstance(instanceId: string, clientId: string): Promise<number> {
  const mine = portalStore
    .endpointMappings()
    .filter((mapping) => mapping.instanceId === instanceId && mapping.clientId === clientId)
  for (const mapping of mine) await releaseEndpoint(mapping.id, clientId)
  return mine.length
}

export function listEndpointsForClient(clientId: string): EndpointMapping[] {
  return portalStore.endpointMappings().filter((mapping) => mapping.clientId === clientId)
}

/**
 * The same list with the DNS each mapping needs, for a panel to show an
 * operator whose zone Portal cannot write to itself.
 */
export function describeEndpointsForClient(clientId: string): AllocatedEndpoint[] {
  const address = portalPublicHost()
  return listEndpointsForClient(clientId).map((mapping) => ({
    ...mapping,
    dnsRecords: dnsRecordsForEndpoint(mapping, address)
  }))
}

/** The mapping serving a given hostname, for the HTTP proxy to route by. */
export function findHttpEndpointByHostname(hostname: string): EndpointMapping | undefined {
  const wanted = hostname.split(':')[0].toLowerCase()
  return portalStore
    .endpointMappings()
    .find((mapping) => mapping.protocol === 'http' && mapping.hostname?.toLowerCase() === wanted)
}
