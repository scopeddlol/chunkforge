import { portalRelay } from './relay'
import { portalStore } from './store'
import type { PortalNode, PortalNodeView, PortalOverview } from './types'

export const PORTAL_VERSION = '0.5.0'

const startedAt = Date.now()

/**
 * A node as one particular control plane should see it. Portal is shared, so
 * "claimed" is relative to whoever is asking — the same record reads as
 * adoptable to its owner and off-limits to everyone else.
 */
export function toNodeView(node: PortalNode, clientId?: string): PortalNodeView {
  return {
    id: node.id,
    name: node.name,
    // The stored status is only ever as fresh as the last heartbeat; the live
    // socket is the truth about whether the node is reachable right now.
    status: portalRelay.isNodeConnected(node.id) ? 'online' : node.status,
    lastSeenAt: node.lastSeenAt,
    pairedAt: node.pairedAt,
    stats: node.stats,
    tunnels: node.tunnels,
    agentReady: portalRelay.isAgentReady(node.id),
    claimed: Boolean(clientId) && node.claimedByClientId === clientId,
    claimedByOther: Boolean(node.claimedByClientId) && node.claimedByClientId !== clientId
  }
}

export function buildOverview(): PortalOverview {
  const nodes = portalStore.nodes()
  return {
    config: portalStore.config(),
    nodeCount: nodes.length,
    onlineNodeCount: nodes.filter((node) => portalRelay.isNodeConnected(node.id)).length,
    clientCount: portalStore.clients().length,
    domainCount: portalStore.domains().length,
    activeTunnelCount: portalRelay.activeTunnelCount(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    version: PORTAL_VERSION
  }
}
