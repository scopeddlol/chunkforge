import { getSettings, listInstanceMetadata } from '@chunkforge/core'
import type { ClientRequestFrame, ClientResponseFrame } from '@chunkforge/portal/protocol'
import { listAllNodes } from './portalLink'
import { listRemoteInstances } from './remoteInstances'

/**
 * Answering the questions a Portal is allowed to ask this control plane.
 *
 * A node accepts whatever its Portal forwards, because a node is a worker with
 * no opinions and nothing of its own to protect. A control plane is different:
 * it holds the accounts, it decides who may do what, and Portal is the one box
 * in the system with a public address. If Portal could run arbitrary API calls
 * here, compromising Portal would compromise every panel attached to it at
 * once.
 *
 * So this is an allowlist, not a proxy. It answers a fixed set of read-only
 * questions and refuses everything else — including anything that would change
 * state, and anything that would reveal accounts. Portal gets to *see* what
 * servers exist across the panels it links, which is what makes a
 * cross-control-plane view possible; it does not get to act on them. Widening
 * this is a deliberate edit to this file, not something that becomes true by
 * accident elsewhere.
 */

/**
 * Exactly what Portal may ask for, and nothing else.
 *
 * Each entry is a *handler*, not a route to proxy to. Forwarding Portal's
 * request into this panel's HTTP API would mean choosing a user to run it as,
 * and there is no such user: Portal is asking about the panel itself, not on
 * anyone's behalf. Answering from the domain layer directly keeps that honest,
 * needs no privileged credential to exist, and makes it impossible for a
 * cleverly shaped path to reach a route that was never meant to be here.
 */
const ALLOWED: ReadonlyArray<{
  method: string
  path: string
  handle: () => Promise<unknown>
}> = [
  // The inventory a cross-plane view is built from.
  { method: 'GET', path: '/api/servers', handle: () => describeServers() },
  // Which machines this panel drives, so the view can group by node.
  { method: 'GET', path: '/api/nodes', handle: () => listAllNodes() }
]

function findHandler(method: string, path: string): (() => Promise<unknown>) | null {
  const bare = path.split('?')[0]
  return ALLOWED.find((rule) => rule.method === method && rule.path === bare)?.handle ?? null
}

export function clientRequestAllowed(method: string, path: string): boolean {
  return findHandler(method, path) !== null
}

/**
 * This panel's servers, local and on nodes.
 *
 * Deliberately a small, fixed shape rather than the full instance record: an
 * inventory needs enough to identify and describe a server, and file paths,
 * Java locations and launch arguments are nobody's business but this panel's.
 */
async function describeServers(): Promise<unknown[]> {
  const [local, remote] = await Promise.all([
    listInstanceMetadata().catch(() => []),
    listRemoteInstances().catch(() => [])
  ])
  const summarise = (server: {
    id: string
    name: string
    status?: string
    serverType?: string
    minecraftVersion?: string
    playersOnline?: number
    portalHostname?: string | null
    nodeId?: string | null
  }): unknown => ({
    id: server.id,
    name: server.name,
    status: server.status,
    serverType: server.serverType,
    minecraftVersion: server.minecraftVersion,
    playersOnline: server.playersOnline,
    portalHostname: server.portalHostname ?? null,
    nodeId: server.nodeId ?? null
  })
  return [...local.map(summarise), ...remote.map(summarise)]
}

/** Whether this panel is willing to answer Portal at all. */
export function sharingWithPortal(): boolean {
  // Absent means yes: the feature is the reason someone links a Portal in the
  // first place, and an operator who does not want it turns it off explicitly.
  return getSettings().portal.shareInventoryWithPortal !== false
}


/**
 * Builds the answer to one `client-request` frame.
 *
 * Refusals are explicit and carry a reason, so an operator reading Portal's
 * logs can tell "this panel says no" apart from "this panel is broken" — the
 * two look identical from the far end otherwise.
 */
export async function answerClientRequest(frame: ClientRequestFrame): Promise<ClientResponseFrame> {
  const base: Pick<ClientResponseFrame, 'type' | 'requestId'> = {
    type: 'client-response',
    requestId: frame.requestId
  }

  if (!sharingWithPortal()) {
    return { ...base, status: 403, error: 'This control plane does not share its servers with Portal.' }
  }
  const handle = findHandler(frame.method, frame.path)
  if (!handle) {
    return {
      ...base,
      status: 403,
      error: `A control plane does not answer ${frame.method} ${frame.path.split('?')[0]}.`
    }
  }

  try {
    return { ...base, status: 200, body: JSON.stringify(await handle()) }
  } catch (err) {
    return { ...base, status: 500, error: (err as Error).message }
  }
}
