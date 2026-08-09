import { randomBytes } from 'crypto'
import type { EndpointProtocol, InstanceMetadata, ServerEndpoint } from '../types/index'
import { findFreePort, portProblem } from './portService'

/**
 * A server's endpoints, and how to get one more.
 *
 * The single `port` field is not going away — it is what `server.properties`
 * holds and what every existing install has — so endpoints are layered over
 * it rather than replacing it. A server that predates this reads as having
 * exactly one endpoint, derived from its port, which keeps every caller that
 * asks "how do I reach this?" working without a migration step that has to
 * succeed before the panel will start.
 */

export const GAME_ENDPOINT_ID = 'game'

export function newEndpointId(): string {
  return randomBytes(6).toString('hex')
}

/**
 * Everything you can connect to on this server.
 *
 * The game port is synthesised rather than stored, so it can never drift from
 * `metadata.port`: changing the port in Settings changes the endpoint, with no
 * second record to keep in step.
 */
export function endpointsFor(metadata: InstanceMetadata): ServerEndpoint[] {
  const game: ServerEndpoint = {
    id: GAME_ENDPOINT_ID,
    label: 'Minecraft',
    protocol: 'tcp',
    localPort: metadata.port,
    publicPort: metadata.portalPublicPort ?? undefined,
    hostname: metadata.portalHostname ?? undefined,
    source: 'server',
    enabled: true
  }
  const extra = (metadata.endpoints ?? []).filter((endpoint) => endpoint.id !== GAME_ENDPOINT_ID)
  return [game, ...extra]
}

/** The stored endpoints only — what may actually be edited. */
export function extraEndpoints(metadata: InstanceMetadata): ServerEndpoint[] {
  return (metadata.endpoints ?? []).filter((endpoint) => endpoint.id !== GAME_ENDPOINT_ID)
}

export interface AddEndpointRequest {
  label: string
  protocol: EndpointProtocol
  /** Pin a specific local port, or omit to have one allocated. */
  localPort?: number
  source?: ServerEndpoint['source']
  addonId?: string
}

/**
 * Adds an endpoint, allocating a local port when one was not pinned.
 *
 * Allocation happens here, on the machine that will actually listen, because
 * it is the only party that can tell whether a port is free. A control plane
 * choosing a number and hoping is how two services end up on one port and the
 * second silently fails to bind.
 */
export async function addEndpoint(
  metadata: InstanceMetadata,
  request: AddEndpointRequest
): Promise<ServerEndpoint> {
  const label = request.label.trim()
  if (!label) throw new Error('An endpoint needs a name')

  const taken = new Set(endpointsFor(metadata).map((endpoint) => endpoint.localPort))

  let localPort: number
  if (request.localPort) {
    if (taken.has(request.localPort)) {
      throw new Error(`This server already uses port ${request.localPort} for something else.`)
    }
    const problem = await portProblem(request.localPort, metadata.id)
    if (problem) throw new Error(problem)
    localPort = request.localPort
  } else {
    // Search above the game port so a server's endpoints stay in one block,
    // which matters to anyone forwarding ports by hand.
    let candidate = await findFreePort(metadata.port + 1, { excludeInstanceId: metadata.id })
    while (taken.has(candidate)) {
      candidate = await findFreePort(candidate + 1, { excludeInstanceId: metadata.id })
    }
    localPort = candidate
  }

  return {
    id: newEndpointId(),
    label,
    protocol: request.protocol,
    localPort,
    source: request.source ?? 'custom',
    addonId: request.addonId,
    enabled: true
  }
}

/**
 * Endpoints an add-on left behind.
 *
 * Uninstalling a plugin should take its networking with it — otherwise a
 * Portal keeps a public port bound for a voice server that no longer exists,
 * and the next person to look at the list has no way to know it is dead.
 */
export function endpointsForAddon(metadata: InstanceMetadata, addonId: string): ServerEndpoint[] {
  return extraEndpoints(metadata).filter(
    (endpoint) => endpoint.source === 'addon' && endpoint.addonId === addonId
  )
}
