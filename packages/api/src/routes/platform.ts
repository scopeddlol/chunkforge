import { randomBytes } from 'crypto'
import type { FastifyInstance } from 'fastify'
import {
  collectDashboardStats,
  detectInstalledJava,
  getSettings,
  instanceManager,
  listInstanceMetadata,
  loadInstanceMetadata,
  saveInstanceMetadata,
  saveSettings,
  type AppSettings,
  type ServerGroup
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'

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
      await saveSettings({ serverGroups: [...getSettings().serverGroups, group] })
      return group
    }
  )

  app.patch<{ Params: { id: string }; Body: { name: string; color: string } }>(
    '/api/groups/:id',
    { preHandler: requireRole('member') },
    async (request) => {
      const next = getSettings().serverGroups.map((g) =>
        g.id === request.params.id ? { ...g, name: request.body.name, color: request.body.color } : g
      )
      await saveSettings({ serverGroups: next })
      return next
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/api/groups/:id',
    { preHandler: requireRole('member') },
    async (request) => {
      const { id } = request.params
      await saveSettings({ serverGroups: getSettings().serverGroups.filter((g) => g.id !== id) })
      // Detach the group from any server still referencing it.
      for (const instance of await listInstanceMetadata()) {
        if (instance.groupId === id) await saveInstanceMetadata({ ...instance, groupId: null })
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
      await saveInstanceMetadata({ ...metadata, groupId })
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
