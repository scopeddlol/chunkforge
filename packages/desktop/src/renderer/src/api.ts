import { ChunkforgeClient, type ServerEvent } from '@chunkforge/api/client'

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
  // window.native only exists under Electron; a browser build talks to its origin.
  const baseUrl = (await window.native?.apiUrl?.()) ?? window.location.origin
  client = new ChunkforgeClient({ baseUrl })
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

/**
 * Subscribes to the live event stream, filtered to one event type. Components
 * use this in place of the old per-channel IPC subscriptions.
 */
export function onEvent(
  type: ServerEvent['type'],
  handler: (payload: never) => void
): () => void {
  return api().events((event) => {
    if (event.type === type) handler(event.payload as never)
  })
}

export type { ServerEvent }
