import {
  ChunkforgeClient,
  type ServerEvent,
  type ServerEventPayloads,
  type ServerEventType
} from '@chunkforge/api/client'

/**
 * One client for the whole renderer. In the desktop app the base URL comes from
 * the embedded API's actual bound port; in a browser build it's same-origin.
 *
 * Pages import `api` and use it directly — the previous `window.chunkforge`
 * bridge is gone, which is what makes this UI reusable on the web.
 */
let client: ChunkforgeClient | null = null
let resolveReady: () => void
const ready = new Promise<void>((resolve) => {
  resolveReady = resolve
})

export async function initApiClient(): Promise<ChunkforgeClient> {
  if (client) return client
  // window.native only exists under Electron; a browser build talks to its
  // origin and authenticates with a session cookie instead of a token.
  const baseUrl = (await window.native?.apiUrl?.()) ?? window.location.origin
  const token = (await window.native?.apiToken?.()) ?? undefined
  client = new ChunkforgeClient({ baseUrl, token })
  resolveReady()
  return client
}

/** Throws if used before init — a programming error, not a runtime condition. */
export function api(): ChunkforgeClient {
  if (!client) throw new Error('API client used before initApiClient() completed')
  return client
}

export function whenApiReady(): Promise<void> {
  return ready
}

// A dozen components subscribe to events, and they share one socket — a
// connection per subscriber would multiply reconnect storms and give the server
// a misleading client count.
//
// The socket opens on first use and then stays open for the lifetime of the
// window. Closing it when the last subscriber goes away sounds tidier, but it
// tears the connection down and rebuilds it on every navigation — and under
// StrictMode's double-invoked effects, on every mount — so any event emitted
// during the gap is simply lost. A console that silently misses the first lines
// after a server starts is a miserable thing to debug.
type Handler = (payload: never) => void
const handlers = new Map<ServerEventType, Set<Handler>>()
let connected = false

function dispatch(event: ServerEvent): void {
  const listeners = handlers.get(event.type)
  if (!listeners) return
  // Copy first: a handler is free to unsubscribe itself while dispatching.
  for (const listener of [...listeners]) {
    listener(event.payload as never)
  }
}

/**
 * Subscribes to one event type on the shared stream. Components use this in
 * place of the old per-channel IPC subscriptions; the returned function
 * unsubscribes and is safe to use directly as a `useEffect` cleanup.
 */
export function onEvent<K extends ServerEventType>(
  type: K,
  handler: (payload: ServerEventPayloads[K]) => void
): () => void {
  let listeners = handlers.get(type)
  if (!listeners) {
    listeners = new Set()
    handlers.set(type, listeners)
  }
  listeners.add(handler as Handler)

  if (!connected) {
    connected = true
    api().events(dispatch)
  }

  return () => {
    listeners.delete(handler as Handler)
    if (listeners.size === 0) handlers.delete(type)
  }
}

export type { ServerEvent, ServerEventPayloads, ServerEventType }
