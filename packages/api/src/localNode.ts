import { hostname } from 'os'
import {
  chunkforgeRoot,
  getPortalStatus,
  getSettings,
  isPortalLinked,
  saveSettings
} from '@chunkforge/core'
import { PortalClient } from '@chunkforge/portal/client'
import { attachNodeLink } from '@chunkforge/node-worker'
import type { RunningCoreApi } from './index'

/**
 * This machine, offered to Portal as somewhere servers can run.
 *
 * A subdomain only works if Portal has an outbound socket to relay traffic
 * down. A separately paired node has one; a desktop install running servers on
 * the machine in front of you does not, which is the whole reason local
 * servers could never be given an address — Portal had nowhere to send the
 * players. Registering the machine as a node of its own closes that gap, and
 * reuses the exact relay a remote node uses, so a local server with a
 * subdomain is not a second code path.
 *
 * Off unless asked for. Plenty of installs deploy only to real nodes and
 * should not be quietly publishing a route into the user's own desktop.
 */

let running: { nodeId: string; close: () => Promise<void> } | null = null
// Held so the settings route can turn hosting on later without every caller
// having to carry the running API around to reach this one function.
let localCoreApi: RunningCoreApi | null = null

export function setLocalCoreApi(api: RunningCoreApi): void {
  localCoreApi = api
}

export function localNodeId(): string | null {
  return running?.nodeId ?? getSettings().portal.selfNodeId ?? null
}

export function isLocalNodeHosting(): boolean {
  return Boolean(running)
}

/**
 * Registers with Portal if needed, then opens the relay socket.
 *
 * Credentials are re-issued on every start rather than stored: Portal returns
 * a node token only once, and re-registering keeps the same node id, so
 * servers already allocated against this machine keep resolving. That makes
 * the cheap path — ask again — also the correct one.
 */
export async function startLocalNodeHosting(coreApi?: RunningCoreApi): Promise<string | null> {
  if (running) return running.nodeId
  const api = coreApi ?? localCoreApi
  if (!api) throw new Error('The Core API is not running yet.')
  if (!isPortalLinked()) throw new Error('Connect this Chunkforge to a Portal first.')

  const portal = getPortalStatus()
  const client = new PortalClient({ baseUrl: portal.portalUrl, token: portal.clientToken })
  const registered = await client.client.registerSelfNode(hostname())

  running = attachNodeLink({
    portalUrl: portal.portalUrl,
    nodeId: registered.nodeId,
    nodeToken: registered.nodeToken,
    dataRoot: chunkforgeRoot(),
    coreApi: api
  })

  if (portal.selfNodeId !== registered.nodeId) {
    await saveSettings({ portal: { ...portal, selfNodeId: registered.nodeId } })
  }
  console.log(`Hosting servers on this machine as Portal node ${registered.nodeId}`)
  return registered.nodeId
}

export async function stopLocalNodeHosting(): Promise<void> {
  const current = running
  running = null
  await current?.close()
}
