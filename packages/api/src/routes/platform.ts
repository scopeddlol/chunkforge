import { randomBytes } from 'crypto'
import type { FastifyInstance } from 'fastify'
import {
  connectDesktopToPortal,
  collectDashboardStats,
  createDesktopConnectorPin,
  autoProvisionInstancePortalHostname,
  createNodePairingCode,
  detectInstalledJava,
  getPortalStatus,
  getSettings,
  instanceManager,
  listInstanceMetadata,
  listNodes,
  loadInstanceMetadata,
  pairNodeByCode,
  redeemNodePortalPin,
  registerPortalNodeTunnels,
  saveInstanceMetadata,
  saveSettings,
  DEFAULT_PROJECT_ID,
  updateNodeHeartbeat,
  updatePortalNodeHeartbeat,
  type AppSettings,
  type NodeStats,
  type PortalTunnelPort,
  type ServerGroup
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'
import { broadcast } from '../events'
import { portalRelay } from '../portalRelay'

export async function registerPlatformRoutes(app: FastifyInstance): Promise<void> {
  // ---- stats ----

  app.get('/api/stats', { preHandler: requireRole('viewer') }, async () => collectDashboardStats())

  app.get('/api/java', { preHandler: requireRole('member') }, async () => detectInstalledJava())

  // ---- settings ----

  app.get('/api/settings', { preHandler: requireRole('viewer') }, async () => {
    const settings = getSettings()
    // The CurseForge key is a secret; report only whether one is configured.
    return { ...settings, curseForgeApiKey: settings.curseForgeApiKey ? '__SET__' : '' }
  })

  app.patch<{ Body: Partial<AppSettings> }>(
    '/api/settings',
    { preHandler: requireRole('admin') },
    async (request) => {
      const patch = { ...request.body }
      // Echoing back the masked placeholder must not overwrite the real key.
      if (patch.curseForgeApiKey === '__SET__') delete patch.curseForgeApiKey
      const updated = await saveSettings(patch)
      return { ...updated, curseForgeApiKey: updated.curseForgeApiKey ? '__SET__' : '' }
    }
  )

  // ---- projects and nodes ----
  //
  // Projects are the new name for groups, and carry the same ids, so the two
  // surfaces describe one set of records. Reads are served from both while the
  // UI moves across.

  app.get('/api/projects', { preHandler: requireRole('viewer') }, async () => getSettings().projects)

  app.get('/api/nodes', { preHandler: requireRole('viewer') }, async () => listNodes())

  app.post<{ Body: { code: string } }>(
    '/api/nodes/pair',
    { preHandler: requireRole('member') },
    async (request) => pairNodeByCode(request.body.code)
  )

  app.post<{ Body: { name?: string } }>(
    '/api/nodes/pairing-code',
    { preHandler: requireRole('admin') },
    async (request) => createNodePairingCode(request.body?.name)
  )

  app.post<{ Params: { id: string }; Body: NodeStats }>(
    '/api/nodes/:id/heartbeat',
    { preHandler: requireRole('admin') },
    async (request) => {
      const node = await updateNodeHeartbeat(request.params.id, request.body)
      broadcast({ type: 'node-updated', payload: node })
      return node
    }
  )

  app.get('/api/portal', { preHandler: requireRole('viewer') }, async () => getPortalStatus())

  app.post<{ Params: { id: string }; Body: { force?: boolean } }>(
    '/api/portal/domains/provision/:id',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        return await autoProvisionInstancePortalHostname(request.params.id, {
          force: Boolean(request.body?.force)
        })
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post('/api/portal/pin', { preHandler: requireRole('member') }, async () => {
    const result = await createDesktopConnectorPin()
    broadcast({ type: 'portal-status', payload: result.portal })
    return result
  })

  app.post<{ Body: { pin: string } }>(
    '/api/portal/connect',
    { preHandler: requireRole('member') },
    async (request) => {
      const portal = await connectDesktopToPortal(request.body.pin)
      broadcast({ type: 'portal-status', payload: portal })
      return portal
    }
  )

  app.post<{ Body: { pin: string; nodeName: string } }>(
    '/api/portal/nodes/redeem',
    async (request, reply) => {
      try {
        return await redeemNodePortalPin(request.body.pin, request.body.nodeName)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Body: { nodeToken: string; stats: NodeStats } }>(
    '/api/portal/nodes/heartbeat',
    async (request, reply) => {
      try {
        const node = await updatePortalNodeHeartbeat(request.body.nodeToken, request.body.stats)
        broadcast({ type: 'node-updated', payload: node })
        return node
      } catch (err) {
        return reply.code(401).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Body: { nodeToken: string; ports: PortalTunnelPort[] } }>(
    '/api/portal/nodes/tunnels',
    async (request, reply) => {
      try {
        const node = await registerPortalNodeTunnels(request.body.nodeToken, request.body.ports)
        await portalRelay.registerNodeTunnels(node.id, request.body.ports)
        broadcast({ type: 'node-updated', payload: node })
        return node
      } catch (err) {
        return reply.code(401).send({ error: (err as Error).message })
      }
    }
  )

  app.get('/api/portal/nodes/channel', { websocket: true }, (connection, request) => {
    const socket = ('socket' in connection ? connection.socket : connection) as {
      send: (data: string) => void
      close: (code?: number, reason?: string) => void
      on: (event: string, listener: (...args: any[]) => void) => void
    }
    if (!request.nodeId) {
      socket.close(1008, 'Node token required')
      return
    }
    portalRelay.registerNodeSocket(request.nodeId, socket)
  })

  // ---- groups ----

  app.get('/api/groups', { preHandler: requireRole('viewer') }, async () => getSettings().serverGroups)

  app.post<{ Body: { name: string; color: string } }>(
    '/api/groups',
    { preHandler: requireRole('member') },
    async (request) => {
      const group: ServerGroup = {
        id: randomBytes(6).toString('hex'),
        name: request.body.name,
        color: request.body.color
      }
      const settings = getSettings()
      await saveSettings({
        serverGroups: [...settings.serverGroups, group],
        projects: [...settings.projects, { ...group, createdAt: new Date().toISOString() }]
      })
      return group
    }
  )

  app.patch<{ Params: { id: string }; Body: { name: string; color: string } }>(
    '/api/groups/:id',
    { preHandler: requireRole('member') },
    async (request) => {
      const { name, color } = request.body
      const settings = getSettings()
      const next = settings.serverGroups.map((g) =>
        g.id === request.params.id ? { ...g, name, color } : g
      )
      await saveSettings({
        serverGroups: next,
        projects: settings.projects.map((p) =>
          p.id === request.params.id ? { ...p, name, color } : p
        )
      })
      return next
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/api/groups/:id',
    { preHandler: requireRole('member') },
    async (request) => {
      const { id } = request.params
      const settings = getSettings()
      await saveSettings({
        serverGroups: settings.serverGroups.filter((g) => g.id !== id),
        // The default project is structural — servers fall back to it — so it is
        // never removed even if a group shared its id.
        projects: settings.projects.filter((p) => p.id !== id || p.isDefault)
      })
      // Re-home any server still referencing the deleted group.
      for (const instance of await listInstanceMetadata()) {
        if (instance.groupId === id) {
          await saveInstanceMetadata({ ...instance, groupId: null, projectId: DEFAULT_PROJECT_ID })
        }
      }
      return { ok: true }
    }
  )

  app.post<{ Params: { id: string }; Body: { instanceId: string } }>(
    '/api/groups/:id/assign',
    { preHandler: requireRole('member') },
    async (request) => {
      const metadata = await loadInstanceMetadata(request.body.instanceId)
      const groupId = request.params.id === 'none' ? null : request.params.id
      await saveInstanceMetadata({
        ...metadata,
        groupId,
        projectId: groupId ?? DEFAULT_PROJECT_ID
      })
      return { ok: true }
    }
  )

  app.post<{ Params: { id: string }; Body: { action: 'start' | 'stop' } }>(
    '/api/groups/:id/bulk',
    { preHandler: requireRole('member') },
    async (request) => {
      const instances = (await listInstanceMetadata()).filter((i) => i.groupId === request.params.id)
      const results = await Promise.allSettled(
        instances.map(async (instance) => {
          const status = instanceManager.getStatus(instance.id)
          if (request.body.action === 'start') {
            if (status !== 'stopped') return
            await instanceManager.startInstance(instance)
          } else {
            if (status === 'stopped') return
            await instanceManager.stopInstance(instance.id)
          }
        })
      )
      return {
        total: instances.length,
        failed: results.filter((r) => r.status === 'rejected').length
      }
    }
  )
}
