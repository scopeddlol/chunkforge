import { readFile } from 'fs/promises'
import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import {
  addEndpoint,
  availableSources,
  endpointsFor,
  endpointsForAddon,
  getSettings,
  profileFor,
  saveInstanceMetadata,
  type ServerEndpoint,
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
  auditInstalledAddons,
  getProvider,
  installContent,
  planInstall,
  removeAddons,
  resolveBestVersion,
  type CompatibilityTarget,
  type ContentKind,
  type PluginSearchQuery,
  type PluginSource,
  type InstanceMetadata,
  type PluginVersion,
  type ServerType
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'
import { guardNodeAccess } from '../auth/nodeAccess'
import { broadcast } from '../events'
import { callNodeAgent } from '../portalLink'
import { nodeForInstance } from '../remoteInstances'

/**
 * The server a request is about, however it was named.
 *
 * An instance id is the honest way to ask — it cannot disagree with itself —
 * but the browser can also be pointed at a hypothetical server (the creation
 * wizard has no instance yet), so an explicit type and version work too.
 * Returns null when the caller named no server at all, which means "judge
 * nothing" rather than "judge against a default".
 */
async function resolveTarget(query: {
  serverType?: ServerType
  minecraftVersion?: string
  instanceId?: string
}): Promise<CompatibilityTarget | null> {
  if (query.instanceId) {
    try {
      const metadata = await loadInstanceMetadata(query.instanceId)
      return { serverType: metadata.serverType, minecraftVersion: metadata.minecraftVersion }
    } catch {
      // A remote server's metadata lives on its node. Falling through to the
      // explicit fields lets the panel answer anyway rather than refusing.
    }
  }
  if (query.serverType && query.minecraftVersion) {
    return { serverType: query.serverType, minecraftVersion: query.minecraftVersion }
  }
  return null
}

/**
 * Opens a port for an add-on that needs one.
 *
 * Installing Simple Voice Chat and finding nobody can hear anything is a bad
 * afternoon: the mod wants UDP and nothing says so until you read a wiki. So a
 * known add-on gets its endpoint the moment it is installed.
 *
 * Best-effort on purpose. A plugin that installed correctly must not report
 * failure because its networking could not be arranged — the endpoint can be
 * added by hand afterwards, and saying "install failed" about a file sitting
 * on disk would be worse than a missing port.
 */
async function provisionAddonEndpoint(
  metadata: InstanceMetadata,
  projectId: string | undefined,
  name: string
): Promise<(ServerEndpoint & { configHint?: string }) | null> {
  const profile = profileFor(projectId) ?? profileFor(name)
  if (!profile) return null
  if (endpointsFor(metadata).some((e) => e.addonId === profile.slugs[0])) return null

  try {
    const endpoint = await addEndpoint(metadata, {
      label: profile.label,
      protocol: profile.protocol,
      localPort: undefined,
      source: 'addon',
      addonId: profile.slugs[0]
    })
    await saveInstanceMetadata({
      ...metadata,
      endpoints: [...(metadata.endpoints ?? []), endpoint]
    })
    // Returned so the UI can say which port to put in the add-on's own config
    // — the number is whatever was free, not the one its docs mention.
    return { ...endpoint, configHint: profile.configHint }
  } catch {
    return null
  }
}

/**
 * The server's world folder name.
 *
 * Read from `server.properties` rather than assumed, because datapacks live
 * inside the world and a server with `level-name=survival` would otherwise
 * have them installed into a folder Minecraft never reads. Falls back to the
 * default when the file cannot be read, which is what a fresh server has.
 */
async function levelNameFor(instancePath: string): Promise<string> {
  try {
    const text = await readFile(join(instancePath, 'server.properties'), 'utf-8')
    const match = text.match(/^level-name=(.+)$/m)
    return match?.[1]?.trim() || 'world'
  } catch {
    return 'world'
  }
}

/**
 * How a pack disagrees with the server it is going onto, or null when it fits.
 *
 * Both halves matter and for different reasons: a loader mismatch means every
 * mod in the pack is the wrong kind of file, and a version mismatch means they
 * are the right kind and will still refuse to load. Naming which one it is
 * saves the guess.
 */
function describeModpackMismatch(
  declared: { serverType: ServerType; minecraftVersion: string },
  server: { serverType: ServerType; minecraftVersion: string; name: string }
): string | null {
  if (declared.serverType !== server.serverType) {
    return `This is a ${declared.serverType} pack and ${server.name} runs ${server.serverType}. Its mods will not load.`
  }
  if (declared.minecraftVersion !== server.minecraftVersion) {
    return `This pack is built for Minecraft ${declared.minecraftVersion} and ${server.name} runs ${server.minecraftVersion}.`
  }
  return null
}

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

  /**
   * A project's builds. Naming a server changes the answer: the list comes
   * back judged and ordered so the first entry is the one to install, rather
   * than merely the newest — which for a project shipping several loaders is
   * the difference between a Paper plugin and a Fabric mod.
   */
  app.get<{
    Querystring: {
      source: PluginSource
      projectId: string
      serverType?: ServerType
      minecraftVersion?: string
      instanceId?: string
      kind?: ContentKind
    }
  }>('/api/addons/versions', { preHandler: requireRole('viewer') }, async (request, reply) => {
    try {
      const target = await resolveTarget(request.query)
      return await listPluginVersions(request.query.source, request.query.projectId, {
        target: target ?? undefined,
        kind: request.query.kind
      })
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

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

  app.post<{
    Params: { id: string }
    Body: { version: PluginVersion; name: string; projectId?: string; force?: boolean }
  }>(
    '/api/servers/:id/addons',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        // The target comes from the server's own record rather than the
        // request body: a caller cannot talk its way past the check by
        // describing the server differently from what it is.
        const path = await installPlugin(
          metadata.path,
          metadata.serverType,
          request.body.version,
          request.body.name,
          {
            target: {
              serverType: metadata.serverType,
              minecraftVersion: metadata.minecraftVersion
            },
            force: request.body.force === true
          }
        )

        const endpoint = await provisionAddonEndpoint(
          metadata,
          request.body.projectId,
          request.body.name
        )

        return { path, endpoint }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /**
   * Which build would be installed, and why not when there is none.
   *
   * One call rather than three, and — more importantly — one implementation of
   * the rules. The browser could in principle judge builds itself, but then
   * the dialog's idea of compatible and the installer's could drift apart, and
   * the one that loses that argument is the user staring at a greyed-out
   * button for a plugin that would have worked.
   */
  app.get<{
    Params: { id: string }
    Querystring: { source: PluginSource; projectId: string; kind?: ContentKind }
  }>(
    '/api/servers/:id/addons/resolve',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        return await resolveBestVersion(
          request.query.source,
          request.query.projectId,
          {
            serverType: metadata.serverType,
            minecraftVersion: metadata.minecraftVersion
          },
          request.query.kind
        )
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /**
   * One-click install.
   *
   * The caller names a *project* and Chunkforge picks the build — which is the
   * only way the choice can be made correctly, because it depends on the
   * server and the person clicking has no reason to know a project ships eight
   * loaders. When nothing fits, the answer says what the project does offer
   * instead of failing with "no versions found".
   */
  app.post<{
    Params: { id: string }
    Body: {
      source: PluginSource
      projectId: string
      name: string
      kind?: ContentKind
      /** Proceed despite a blocking warning the caller has been shown. */
      acknowledge?: boolean
    }
  }>(
    '/api/servers/:id/addons/install',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      let metadata
      try {
        metadata = await loadInstanceMetadata(request.params.id)
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message })
      }

      const target = {
        serverType: metadata.serverType,
        minecraftVersion: metadata.minecraftVersion
      }

      try {
        const installed = await listInstalledPlugins(metadata.path, metadata.serverType).catch(
          () => []
        )
        const plan = await planInstall(
          request.body.source,
          request.body.projectId,
          target,
          getProvider,
          { kind: request.body.kind, installed: installed.map((p) => p.filename) }
        )

        if (plan.install.length === 0) {
          // 409 rather than 400: the request was well formed, the world just
          // does not contain a build that fits.
          return reply.code(409).send({ error: plan.reason ?? 'No compatible build found.' })
        }

        /**
         * A blocking warning stops the install unless it is acknowledged.
         *
         * Client-only mods and known conflicts are the two cases: both produce
         * a server that either does nothing new or does not start, and finding
         * that out from a crash log is exactly the afternoon this avoids.
         */
        const blocking = plan.warnings.filter((w) => w.blocking)
        if (blocking.length > 0 && !request.body.acknowledge) {
          return reply.code(409).send({
            error: blocking[0].message,
            warnings: plan.warnings,
            plan: plan.install.map((entry) => ({ name: entry.name, isDependency: entry.isDependency }))
          })
        }

        // Dependencies first: a server that is restarted mid-install should
        // find a library without its dependant rather than the reverse.
        const ordered = [...plan.install].sort(
          (a, b) => Number(b.isDependency) - Number(a.isDependency)
        )
        const written: string[] = []
        for (const entry of ordered) {
          written.push(
            await installPlugin(metadata.path, metadata.serverType, entry.version, entry.name, {
              target,
              // Already judged by the planner against this same target.
              force: true
            })
          )
        }

        const endpoint = await provisionAddonEndpoint(metadata, request.body.projectId, request.body.name)
        const root = plan.install.find((entry) => !entry.isDependency)
        return {
          path: written[written.length - 1],
          version: root?.version ?? null,
          dependencies: plan.install.filter((e) => e.isDependency).map((e) => e.name),
          warnings: plan.warnings,
          endpoint
        }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /**
   * What is installed, and what should not be.
   *
   * Every jar is identified by its hash rather than its name — a filename can
   * be anything, and an audit that guessed from one would eventually delete
   * the wrong mod. Files nothing can identify are reported as unidentified and
   * never flagged, which is the honest answer for a plugin from a private
   * build server.
   */
  app.get<{ Params: { id: string } }>(
    '/api/servers/:id/addons/audit',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        return await auditInstalledAddons(
          metadata.path,
          metadata.serverType,
          {
            serverType: metadata.serverType,
            minecraftVersion: metadata.minecraftVersion
          },
          getProvider
        )
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /**
   * Removes files the audit flagged.
   *
   * The caller sends the filenames it was shown rather than asking for "all
   * problems", so what is deleted is exactly what was on screen — re-deriving
   * the list here would open a gap between the two, and the thing in that gap
   * is somebody's mod.
   */
  app.post<{ Params: { id: string }; Body: { filenames: string[] } }>(
    '/api/servers/:id/addons/audit/clean',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        const removed = await removeAddons(
          metadata.path,
          metadata.serverType,
          Array.isArray(request.body?.filenames) ? request.body.filenames : []
        )
        return { removed }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /**
   * Installs a world, datapack or resource pack.
   *
   * Separate from the add-on route because these are not code the server
   * loads, and one of them replaces the save. Sharing a path with "drop a jar
   * in a folder" is how a click that looked like every other install would
   * quietly delete a world.
   */
  app.post<{
    Params: { id: string }
    Body: {
      source: PluginSource
      projectId: string
      name: string
      kind: ContentKind
      /** Required for a world: it replaces the one players are standing in. */
      replaceExistingWorld?: boolean
    }
  }>(
    '/api/servers/:id/content/install',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      const kind = request.body?.kind
      if (kind !== 'world' && kind !== 'datapack' && kind !== 'resourcepack') {
        return reply
          .code(400)
          .send({ error: 'Mods and plugins install through the add-ons route.' })
      }

      let metadata
      try {
        metadata = await loadInstanceMetadata(request.params.id)
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message })
      }

      try {
        const resolved = await resolveBestVersion(
          request.body.source,
          request.body.projectId,
          {
            serverType: metadata.serverType,
            minecraftVersion: metadata.minecraftVersion
          },
          kind
        )
        if (!resolved.version) {
          return reply.code(409).send({ error: resolved.reason ?? 'No compatible download found.' })
        }

        const result = await installContent(
          metadata.path,
          kind,
          resolved.version,
          request.body.name,
          {
            levelName: await levelNameFor(metadata.path),
            replaceExistingWorld: request.body.replaceExistingWorld === true
          }
        )
        return { ...result, version: resolved.version }
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
        const filename = decodeURIComponent(request.params.filename)
        await uninstallPlugin(metadata.path, metadata.serverType, filename)

        /**
         * Take the add-on's networking with it.
         *
         * Otherwise a Portal keeps a public port bound for a voice server that
         * no longer exists, and the next person to read the endpoint list has
         * no way to tell which entries are dead. Matched on the jar's own name
         * because that is all an uninstall is given — the profile slugs are
         * compared letter-by-letter, so `simple-voice-chat-2.5.jar` still
         * finds its profile.
         */
        const profile = profileFor(filename)
        const orphaned = profile ? endpointsForAddon(metadata, profile.slugs[0]) : []
        if (orphaned.length > 0) {
          const dropped = new Set(orphaned.map((endpoint) => endpoint.id))
          await saveInstanceMetadata({
            ...metadata,
            endpoints: (metadata.endpoints ?? []).filter((endpoint) => !dropped.has(endpoint.id))
          })
        }
        return { ok: true, removedEndpoints: orphaned.map((endpoint) => endpoint.id) }
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
    Body: {
      source: PluginSource
      downloadUrl: string
      curseForgeApiKey?: string
      /** Install despite a loader or version mismatch the caller has seen. */
      acknowledge?: boolean
    }
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

        /**
         * Check the pack against the server before writing anything.
         *
         * A Fabric 1.20.1 pack unpacked onto a Paper 1.21.10 server produces
         * two hundred files that will never load and a server that no longer
         * starts — and the previous behaviour was to do exactly that and
         * report success. Reading the pack's own declared loader and version
         * costs one download and turns a wasted evening into a sentence.
         */
        if (!request.body?.acknowledge) {
          const declared = await readModpackTarget(source, downloadUrl).catch(() => null)
          if (declared) {
            const mismatch = describeModpackMismatch(declared, metadata)
            if (mismatch) {
              return reply.code(409).send({ error: mismatch, declared })
            }
          }
        }

        // Progress goes out on the shared event socket rather than being held
        // open on this request, so any connected client can follow along.
        const report = await installModpack(
          source,
          downloadUrl,
          metadata.path,
          (progress) => broadcast({ type: 'modpack-progress', payload: { instanceId, ...progress } }),
          // A node receives this in its body; running locally it is already
          // in settings, but passing it keeps both paths reading the same way.
          request.body?.curseForgeApiKey ?? key
        )
        return { ok: true, ...report }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )
}
