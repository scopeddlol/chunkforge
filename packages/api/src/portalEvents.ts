import WebSocket from 'ws'
import { getPortalStatus, isPortalLinked, savePortalStatus } from '@chunkforge/core'
import { PortalClient } from '@chunkforge/portal/client'
import type { ClientRequestFrame, EventPushFrame } from '@chunkforge/portal/protocol'
import { broadcast } from './events'
import { answerClientRequest } from './portalRequests'
import type { ServerEvent } from './eventTypes'

/**
 * Receives events a claimed node pushes through Portal and re-broadcasts them
 * on this Core API's own event stream — the same one the renderer already
 * connects to for local servers.
 *
 * This is the piece that makes a remote server's console, status, and player
 * list update live instead of only on the next manual refetch: the node's own
 * Core API already broadcasts these events locally; the node forwards its own
 * broadcast up the Portal channel; Portal hands it to whichever client has
 * that node claimed; and this reinjects it here, where every existing
 * `onEvent('log', ...)`-style subscriber picks it up with no changes of its
 * own, because a remote event and a local one now look identical by the time
 * anything downstream of `broadcast()` sees them.
 *
 * The socket comes from `ws` rather than the global `WebSocket` on purpose.
 * This module runs in every host that links to a Portal, and one of them is
 * Electron's main process — Electron 32 ships Node 20, where the global does
 * not exist at all. Reaching for it there threw a ReferenceError out of
 * `startCoreApi()` before the desktop app had built its window, so the whole
 * app failed to launch for anyone who had paired a Portal.
 */

let socket: WebSocket | null = null
let closed = true
let retryDelayMs = 1000

export function startPortalEventRelay(): void {
  closed = false
  // Live remote events are an enhancement, never a prerequisite for booting.
  // Whatever goes wrong reaching a Portal, the control plane still has to come
  // up and manage its local servers, so this can report a failure but must
  // never propagate one to its caller.
  try {
    connect()
  } catch (err) {
    console.error(`Portal event relay could not start: ${(err as Error).message}`)
  }
}

export function stopPortalEventRelay(): void {
  closed = true
  socket?.close()
  socket = null
}

function connect(): void {
  if (closed || socket) return
  const portal = getPortalStatus()
  if (!isPortalLinked()) return

  const client = new PortalClient({ baseUrl: portal.portalUrl, token: portal.clientToken })
  const ws = new WebSocket(client.client.channelUrl(portal.clientToken))
  socket = ws

  ws.on('open', () => {
    retryDelayMs = 1000
    // This socket succeeding is the most direct evidence there is that the
    // Portal link works, so it — not a value written during last run's pairing
    // — is what the status reflects. A control plane that restarts while its
    // Portal is down now says so, instead of reporting the "connected" it was
    // left on and looking wonky until someone reopened the settings page.
    void markLink('connected')
  })
  ws.on('message', (data: unknown) => {
    let frame: EventPushFrame | ClientRequestFrame
    try {
      frame = JSON.parse(String(data)) as EventPushFrame | ClientRequestFrame
    } catch {
      return
    }

    if (frame.type === 'client-request') {
      // Portal asking this control plane something. What it may ask is fixed
      // and read-only — see portalRequests.ts — and the reply always goes back
      // so a refusal is distinguishable from a panel that simply never answers.
      void answerClientRequest(frame)
        .then((response) => ws.send(JSON.stringify(response)))
        .catch(() => undefined)
      return
    }

    if (frame.type !== 'event-push') return
    // The node emitted this from its own attachCoreEvents(), so it is already
    // a well-formed ServerEvent — Portal only relayed it, never inspected it.
    broadcast(frame.event as ServerEvent)
  })
  ws.on('close', () => {
    socket = null
    if (!closed) void markLink('disconnected', 'Lost contact with Portal.')
    if (closed) return
    setTimeout(connect, retryDelayMs).unref?.()
    // A Portal that is restarting or unreachable should not be hit once a
    // second by every linked control plane trying to reconnect at once.
    retryDelayMs = Math.min(retryDelayMs * 2, 30_000)
  })
  // Never rethrown: an unreachable Portal is an ordinary condition, and an
  // unhandled 'error' event on a ws socket is a process-level crash.
  ws.on('error', () => ws.close())
}

/**
 * Mirrors the live socket's state into stored settings and out to the UI.
 *
 * Written only on change: the relay reconnects on a backoff for as long as a
 * Portal is unreachable, and rewriting the same status on every attempt would
 * be a settings write and a UI event every few seconds for no new information.
 */
async function markLink(
  connectionStatus: 'connected' | 'disconnected',
  lastError?: string
): Promise<void> {
  try {
    if (getPortalStatus().connectionStatus === connectionStatus) return
    const portal = await savePortalStatus({
      connectionStatus,
      lastError: connectionStatus === 'connected' ? undefined : lastError
    })
    broadcast({ type: 'portal-status', payload: portal })
  } catch {
    // Status is a convenience. Failing to record it must never take down the
    // relay that was reporting it.
  }
}
