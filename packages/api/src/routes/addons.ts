import type { FastifyInstance } from 'fastify'
import {
  availableSources,
  getSettings,
  listGameVersions,
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
import { guardNodeAccess } from '../auth/nodeAccess'
import { broadcast } from '../events'
import { callNodeAgent } from '../portalLink'
import { nodeForInstance } from '../remoteInstances'

export async function registerAddonRoutes(app: FastifyInstance): Promise<void> {
  // ---- catalogue ----

  app.post<{ Body: PluginSearchQuery }>(
    '/api/addons/search',
    { preHandler: requireRole('viewer') },
    async (request) => searchPlugins(request.body)
  )

  app.get('/api/addons/sources', { preHandler: requireRole('viewer') }, async () => availableSources())

  // One list for every tab and every source. Built from Mojang's manifest
  // rather than any catalogue, so the options do not change depending on which
  // tab happens to be open.
  app.get('/api/addons/game-versions', { preHandler: requireRole('viewer') }, async (_req, reply) => {
    try {
      return await listGameVersions()
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message })
    }
  })

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

  /**
   * Installs a modpack onto a server, here or on the node that runs it.
   *
   * Forwarded by hand rather than by the transparent hook, because a
   * CurseForge pack cannot be installed without a key and the key lives here,
   * on the control plane. The node has its own settings.json and has never
   * been told what the operator typed into this panel's Settings — which is
   * exactly why installing onto a node used to fail with "no API key" while
   * browsing packs from the same panel worked fine.
   */
  app.post<{
    Params: { id: string }
    Body: { source: PluginSource; downloadUrl: string; curseForgeApiKey?: string }
  }>(
    '/api/servers/:id/modpack',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      const instanceId = request.params.id
      const { source, downloadUrl } = request.body ?? {}
      // Callers never supply this; it is added on the way out to a node.
      const key = getSettings().curseForgeApiKey?.trim() || undefined

      const remoteNode = nodeForInstance(instanceId)
      if (remoteNode) {
        if (!(await guardNodeAccess(request, reply, remoteNode))) return
        try {
          const response = await callNodeAgent(
            remoteNode,
            'POST',
            `/api/servers/${encodeURIComponent(instanceId)}/modpack`,
            { source, downloadUrl, curseForgeApiKey: key }
          )
          const body = (await response.json().catch(() => ({}))) as { error?: string }
          if (!response.ok) {
            return reply.code(response.status).send({ error: body.error ?? 'The node refused that install.' })
          }
          return body
        } catch (err) {
          return reply.code(502).send({ error: (err as Error).message })
        }
      }

      try {
        const metadata = await loadInstanceMetadata(instanceId)
        // Progress goes out on the shared event socket rather than being held
        // open on this request, so any connected client can follow along.
        await installModpack(
          source,
          downloadUrl,
          metadata.path,
          (progress) => broadcast({ type: 'modpack-progress', payload: { instanceId, ...progress } }),
          // A node receives this in its body; running locally it is already
          // in settings, but passing it keeps both paths reading the same way.
          request.body?.curseForgeApiKey ?? key
        )
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )
}
