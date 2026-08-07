import type { FastifyInstance } from 'fastify'
import {
  availableSources,
  installModpack,
  installPlugin,
  listInstalledPlugins,
  listModpackVersions,
  listPluginVersions,
  loadInstanceMetadata,
  readModpackTarget,
  searchModpacks,
  searchPlugins,
  setPluginEnabled,
  uninstallPlugin,
  type PluginSearchQuery,
  type PluginSource,
  type PluginVersion
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'
import { broadcast } from '../events'

export async function registerAddonRoutes(app: FastifyInstance): Promise<void> {
  // ---- catalogue ----

  app.post<{ Body: PluginSearchQuery }>(
    '/api/addons/search',
    { preHandler: requireRole('viewer') },
    async (request) => searchPlugins(request.body)
  )

  app.get('/api/addons/sources', { preHandler: requireRole('viewer') }, async () => availableSources())

  app.get<{ Querystring: { source: PluginSource; projectId: string } }>(
    '/api/addons/versions',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        return await listPluginVersions(request.query.source, request.query.projectId)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  // ---- per-server installed add-ons ----

  app.get<{ Params: { id: string } }>(
    '/api/servers/:id/addons',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        return await listInstalledPlugins(metadata.path, metadata.serverType)
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string }; Body: { version: PluginVersion; name: string } }>(
    '/api/servers/:id/addons',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        const path = await installPlugin(
          metadata.path,
          metadata.serverType,
          request.body.version,
          request.body.name
        )
        return { path }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.patch<{ Params: { id: string; filename: string }; Body: { enabled: boolean } }>(
    '/api/servers/:id/addons/:filename',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        await setPluginEnabled(
          metadata.path,
          metadata.serverType,
          decodeURIComponent(request.params.filename),
          request.body.enabled
        )
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.delete<{ Params: { id: string; filename: string } }>(
    '/api/servers/:id/addons/:filename',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        await uninstallPlugin(
          metadata.path,
          metadata.serverType,
          decodeURIComponent(request.params.filename)
        )
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  // ---- modpacks ----

  app.get<{ Querystring: { query?: string; limit?: string } }>(
    '/api/modpacks/search',
    { preHandler: requireRole('viewer') },
    async (request) => searchModpacks(request.query.query ?? '', Number(request.query.limit ?? 20))
  )

  app.get<{ Querystring: { source: PluginSource; projectId: string } }>(
    '/api/modpacks/versions',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        return await listModpackVersions(request.query.source, request.query.projectId)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Body: { source: PluginSource; downloadUrl: string } }>(
    '/api/modpacks/inspect',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        return await readModpackTarget(request.body.source, request.body.downloadUrl)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string }; Body: { source: PluginSource; downloadUrl: string } }>(
    '/api/servers/:id/modpack',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      const instanceId = request.params.id
      try {
        const metadata = await loadInstanceMetadata(instanceId)
        // Progress goes out on the shared event socket rather than being held
        // open on this request, so any connected client can follow along.
        await installModpack(request.body.source, request.body.downloadUrl, metadata.path, (progress) =>
          broadcast({ type: 'modpack-progress', payload: { instanceId, ...progress } })
        )
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )
}
