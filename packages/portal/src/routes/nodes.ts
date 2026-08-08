import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { hashToken, newToken, requireNode } from '../auth'
import { broadcastPortal } from '../events'
import { portalRelay } from '../relay'
import { nodeClaimants } from '../nodeClaims'
import { portalStore } from '../store'
import { buildOverview, toNodeView } from '../views'
import type { PortalNode, PortalNodeStats, PortalTunnel } from '../types'

/**
 * The node-facing surface. A Chunkforge Node redeems a pin here, then keeps one
 * outbound WebSocket open for the rest of its life — that socket is the only
 * way traffic or control requests ever reach it, so the node itself needs no
 * inbound firewall rules at all.
 */
export async function registerNodeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { pin: string; name?: string } }>('/api/node/redeem', async (request, reply) => {
    try {
      const pin = await portalStore.redeemPin(request.body?.pin ?? '', 'node')
      const token = newToken()
      const now = new Date().toISOString()
      const node: PortalNode = {
        id: randomUUID(),
        name: request.body?.name?.trim() || pin.label || 'Chunkforge Node',
        tokenHash: hashToken(token),
        status: 'offline',
        pairedAt: now,
        lastSeenAt: now,
        tunnels: []
      }
      await portalStore.upsertNode(node)
      broadcastPortal({ type: 'node-updated', payload: toNodeView(node) })
      return {
        nodeId: node.id,
        nodeToken: token,
        portalBaseUrl: portalStore.config().publicBaseUrl,
        zoneSuffix: portalStore.config().zoneSuffix
      }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post<{ Body: { stats: PortalNodeStats; agentReady?: boolean } }>(
    '/api/node/heartbeat',
    { preHandler: requireNode },
    async (request, reply) => {
      const node = portalStore.findNode(request.portalNodeId!)
      if (!node) return reply.code(404).send({ error: 'Unknown node.' })
      node.stats = request.body?.stats
      node.lastSeenAt = new Date().toISOString()
      node.status = 'online'
      if (request.body?.agentReady !== undefined) node.agentReady = request.body.agentReady
      await portalStore.upsertNode(node)
      const view = toNodeView(node, nodeClaimants(node)[0])
      broadcastPortal({ type: 'node-updated', payload: view })
      return view
    }
  )

  /**
   * The node declares which ports it can serve. Portal reconciles that against
   * what is already bound, and answers with the tunnels it actually opened —
   * which may differ, because a domain allocated while the node was away adds
   * routes the node never asked for.
   */
  app.post<{ Body: { tunnels: PortalTunnel[] } }>(
    '/api/node/tunnels',
    { preHandler: requireNode },
    async (request, reply) => {
      const node = portalStore.findNode(request.portalNodeId!)
      if (!node) return reply.code(404).send({ error: 'Unknown node.' })

      const declared = request.body?.tunnels ?? []
      // Domain-derived tunnels are Portal's own records and outrank anything a
      // node announces, so they are merged back in rather than overwritten.
      const domainTunnels = node.tunnels.filter((tunnel) => tunnel.id.startsWith('domain:'))
      const merged = [
        ...domainTunnels,
        ...declared.filter(
          (tunnel) => !domainTunnels.some((existing) => existing.publicPort === tunnel.publicPort)
        )
      ]

      try {
        const opened = await portalRelay.syncNodeTunnels(node.id, merged)
        node.tunnels = merged
        await portalStore.upsertNode(node)
        broadcastPortal({ type: 'node-updated', payload: toNodeView(node, nodeClaimants(node)[0]) })
        broadcastPortal({ type: 'overview', payload: buildOverview() })
        return { tunnels: opened }
      } catch (err) {
        return reply.code(409).send({ error: (err as Error).message })
      }
    }
  )

  app.get('/api/node/channel', { websocket: true }, (connection, request) => {
    const socket = (
      connection && typeof connection === 'object' && 'socket' in connection
        ? (connection as { socket: unknown }).socket
        : connection
    ) as Parameters<typeof portalRelay.registerNodeSocket>[1]

    if (!request.portalNodeId) {
      socket.close(1008, 'Node token required')
      return
    }
    const nodeId = request.portalNodeId
    portalRelay.registerNodeSocket(nodeId, socket)

    // Reopening the tunnels the node already owns is what makes a reconnect
    // self-healing: the node comes back and its routes are live again without
    // anyone re-announcing anything.
    const node = portalStore.findNode(nodeId)
    if (node && node.tunnels.length > 0) {
      void portalRelay.syncNodeTunnels(nodeId, node.tunnels).catch(() => {
        // A port stolen while the node was away is reported on its next
        // announce; failing the socket here would just loop it.
      })
    }

    socket.on('close', () => {
      const record = portalStore.findNode(nodeId)
      if (!record) return
      record.status = 'offline'
      void portalStore.upsertNode(record).then(() => {
        broadcastPortal({ type: 'node-updated', payload: toNodeView(record, nodeClaimants(record)[0]) })
      })
    })
  })
}
