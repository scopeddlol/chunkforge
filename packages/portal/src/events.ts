import type { PortalDomain, PortalNodeView, PortalOverview } from './types'

export interface PortalEventPayloads {
  'node-updated': PortalNodeView
  'node-removed': { id: string }
  'domain-updated': PortalDomain
  'domain-removed': { hostname: string }
  overview: PortalOverview
}

export type PortalEventType = keyof PortalEventPayloads

export type PortalEvent = {
  [K in PortalEventType]: { type: K; payload: PortalEventPayloads[K] }
}[PortalEventType]

type Subscriber = (event: PortalEvent) => void

const subscribers = new Set<Subscriber>()

export function subscribePortalEvents(subscriber: Subscriber): () => void {
  subscribers.add(subscriber)
  return () => subscribers.delete(subscriber)
}

/** Fan-out to the admin UI and to any attached control plane watching state. */
export function broadcastPortal(event: PortalEvent): void {
  for (const subscriber of [...subscribers]) {
    try {
      subscriber(event)
    } catch {
      // A dead socket must not stop the rest of the fan-out.
    }
  }
}
