import { randomBytes } from 'crypto'
import type { FastifyInstance } from 'fastify'
import {
  collectDashboardStats,
  detectInstalledJava,
  getPortalStatus,
  getSettings,
  instanceManager,
  listInstanceMetadata,
  loadInstanceMetadata,
  saveInstanceMetadata,
  saveSettings,
  updateLocalNodeStats,
  DEFAULT_PROJECT_ID,
  type AppSettings,
  type InstanceMetadata,
  type NodeStats,
  type ServerGroup
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'
import { broadcast } from '../events'
import {
  callNodeAgent,
  claimPortalNode,
  connectToPortal,
  disconnectFromPortal,
  listAllNodes,
  listPortalDomains,
  provisionInstanceDomain,
  refreshPortalStatus,
  releaseInstanceDomain,
  releasePortalNode,
  renameInstanceDomain
} from '../portalLink'
import { nodeForInstance } from '../remoteInstances'

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

  // The local machine plus whatever the Portal knows about. Nodes are never
  // paired here — that happens once, at the Portal.
  app.get('/api/nodes', { preHandler: requireRole('viewer') }, async () => listAllNodes())

  app.post<{ Params: { id: string } }>(
    '/api/nodes/:id/claim',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        await claimPortalNode(request.params.id)
        const nodes = await listAllNodes()
        const node = nodes.find((entry) => entry.id === request.params.id)
        if (node) broadcast({ type: 'node-updated', payload: node })
        return node ?? { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/nodes/:id/release',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        await releasePortalNode(request.params.id)
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Body: NodeStats }>(
    '/api/nodes/local/stats',
    { preHandler: requireRole('admin') },
    async (request) => {
      const node = await updateLocalNodeStats(request.body)
      broadcast({ type: 'node-updated', payload: node })
      return node
    }
  )

  // ---- portal link ----
  //
  // This Chunkforge is a *client* of a Portal. It cannot broker pins, relay
  // traffic, or hand out subdomains — a Portal does all of that, and runs
  // somewhere with a public address.

  app.get('/api/portal', { preHandler: requireRole('viewer') }, async () => getPortalStatus())

  app.post('/api/portal/refresh', { preHandler: requireRole('member') }, async () => {
    const portal = await refreshPortalStatus()
    broadcast({ type: 'portal-status', payload: portal })
    return portal
  })

  app.post<{ Body: { portalUrl: string; pin: string; name?: string; kind?: 'desktop' | 'web' } }>(
    '/api/portal/connect',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      try {
        const portal = await connectToPortal(
          request.body.portalUrl,
          request.body.pin,
          request.body.name?.trim() || 'Chunkforge',
          request.body.kind === 'web' ? 'web' : 'desktop'
        )
        broadcast({ type: 'portal-status', payload: portal })
        return portal
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post('/api/portal/disconnect', { preHandler: requireRole('admin') }, async () => {
    const portal = await disconnectFromPortal()
    broadcast({ type: 'portal-status', payload: portal })
    return portal
  })

  app.get('/api/portal/domains', { preHandler: requireRole('viewer') }, async () =>
    listPortalDomains()
  )

  /**
   * A server only ever gets a Portal address when it lives on a node, and a
   * server on a node has no *local* metadata file at all — the node holds the
   * real record. So this resolves the same shape two different ways rather
   * than assuming `loadInstanceMetadata` will work, which is what silently
   * broke domain actions for every remote server before this.
   */
  async function resolveInstanceForDomain(id: string): Promise<InstanceMetadata> {
    const remoteNodeId = nodeForInstance(id)
    if (!remoteNodeId) return loadInstanceMetadata(id)

    const response = await callNodeAgent(remoteNodeId, 'GET', `/api/servers/${encodeURIComponent(id)}`)
    if (!response.ok) throw new Error('Could not reach that server on its node.')
    const metadata = (await response.json()) as InstanceMetadata
    // The id belongs to *this* node once we are asking it directly — stamping
    // our node id back on keeps provisionInstanceDomain's routing decision
    // correct for the caller.
    return { ...metadata, nodeId: remoteNodeId }
  }

  app.post<{ Params: { id: string }; Body: { force?: boolean; label?: string } }>(
    '/api/portal/domains/:id',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        const instance = await resolveInstanceForDomain(request.params.id)
        const domain = await provisionInstanceDomain(instance, {
          force: Boolean(request.body?.force),
          label: request.body?.label
        })
        if (!domain) {
          return reply
            .code(400)
            .send({ error: 'That server is not on a Portal node, or Portal is not linked.' })
        }
        return domain
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/api/portal/domains/:id',
    { preHandler: requireRole('member') },
    async (request) => {
      // Portal resolves *which* domain to release by instance id on its own
      // side, but clearing the binding locally still needs to know whether
      // that id belongs to this machine or a remote node.
      await releaseInstanceDomain({ id: request.params.id, nodeId: nodeForInstance(request.params.id) })
      return { ok: true }
    }
  )

  app.post<{ Params: { id: string }; Body: { label: string } }>(
    '/api/portal/domains/:id/rename',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        return await renameInstanceDomain(
          { id: request.params.id, nodeId: nodeForInstance(request.params.id) },
          request.body?.label ?? ''
        )
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

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
