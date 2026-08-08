import { existsSync } from 'fs'
import { readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import {
  instanceManager,
  listInstanceMetadata,
  listVersions,
  loadInstanceMetadata,
  removeInstanceFromIndex,
  renderServerProperties,
  saveInstanceMetadata,
  type CreateInstanceConfig,
  type InstanceMetadata,
  type InstanceSummary,
  type ServerType
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'
import { callNodeAgent, provisionInstanceDomain, releaseInstanceDomain } from '../portalLink'
import {
  createRemoteInstance,
  forgetRemoteInstance,
  listRemoteInstances,
  nodeForInstance
} from '../remoteInstances'

/**
 * Live process state always wins over what was persisted, since the stored
 * status is only accurate at the moment it was written.
 */
function withLiveState<T extends { id: string }>(
  metadata: T
): T & { status: string; playersOnline: number; onlinePlayers: string[] } {
  const onlinePlayers = instanceManager.getOnlinePlayers(metadata.id)
  return {
    ...metadata,
    status: instanceManager.getStatus(metadata.id),
    playersOnline: onlinePlayers.length,
    onlinePlayers
  }
}

function toSummary(metadata: InstanceMetadata): InstanceSummary {
  const {
    path: _path,
    javaPath: _javaPath,
    minRamMb: _minRamMb,
    port: _port,
    toggles: _toggles,
    eulaAccepted: _eulaAccepted,
    ...summary
  } = metadata
  return withLiveState(summary as InstanceSummary)
}

export async function registerServerRoutes(app: FastifyInstance): Promise<void> {
  // One list, wherever the servers actually run. Remote ones are fetched from
  // their nodes through Portal and appear beside the local ones.
  app.get('/api/servers', { preHandler: requireRole('viewer') }, async () => {
    const [local, remote] = await Promise.all([listLocalSummaries(), listRemoteInstances()])
    return [...local, ...remote]
  })

  async function listLocalSummaries(): Promise<InstanceSummary[]> {
    const all = await listInstanceMetadata()
    return Promise.all(
      all.map(async (metadata) => {
        const summary = toSummary(metadata)
        const iconPath = join(metadata.path, 'server-icon.png')
        if (!existsSync(iconPath)) return summary
        try {
          const data = await readFile(iconPath)
          return { ...summary, iconDataUrl: `data:image/png;base64,${data.toString('base64')}` }
        } catch {
          return summary
        }
      })
    )
  }

  app.get<{ Params: { id: string } }>(
    '/api/servers/:id',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        return withLiveState(await loadInstanceMetadata(request.params.id))
      } catch {
        return reply.code(404).send({ error: 'No such server' })
      }
    }
  )

  /**
   * Creates a server, here or on a node.
   *
   * Both paths end the same way: the server exists, and then Portal is asked
   * for an address for it. That second step is what makes every server
   * reachable by name without anyone opening a port — see `provisionInstanceDomain`.
   */
  app.post<{ Body: CreateInstanceConfig }>(
    '/api/servers',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      const targetNode = request.body?.nodeId
      try {
        if (targetNode && targetNode !== 'local') {
          const created = await createRemoteInstance(targetNode, request.body)
          const metadata = {
            ...(created as unknown as InstanceMetadata),
            id: created.id,
            name: created.name,
            port: created.port,
            nodeId: targetNode
          }
          const domain = await provisionInstanceDomain(metadata, {
            label: request.body.subdomainLabel
          }).catch(() => null)
          return { ...created, nodeId: targetNode, portalHostname: domain?.hostname ?? null }
        }

        const created = await instanceManager.createInstance(request.body)
        // A local server has no Portal route: Portal proxies to nodes, and this
        // machine is not one. It keeps its plain host:port.
        return created
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/servers/:id/start',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        await instanceManager.startInstance(await loadInstanceMetadata(request.params.id))
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/servers/:id/stop',
    { preHandler: requireRole('member') },
    async (request) => {
      await instanceManager.stopInstance(request.params.id)
      return { ok: true }
    }
  )

  app.post<{ Params: { id: string }; Body: { command: string } }>(
    '/api/servers/:id/command',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        instanceManager.sendCommand(request.params.id, request.body.command)
        return { ok: true }
      } catch (err) {
        return reply.code(409).send({ error: (err as Error).message })
      }
    }
  )

  app.patch<{ Params: { id: string }; Body: Partial<InstanceMetadata> }>(
    '/api/servers/:id',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        const patch = request.body ?? {}
        const next: InstanceMetadata = {
          ...metadata,
          name: patch.name ?? metadata.name,
          port: patch.port ?? metadata.port,
          minRamMb: patch.minRamMb ?? metadata.minRamMb,
          maxRamMb: patch.maxRamMb ?? metadata.maxRamMb,
          accentColor: patch.accentColor ?? metadata.accentColor,
          ramAllocatedMb: patch.maxRamMb ?? metadata.maxRamMb,
          toggles: patch.toggles ?? metadata.toggles,
          launchArgs: patch.launchArgs ?? metadata.launchArgs
        }
        await saveInstanceMetadata(next)
        await writeFile(
          join(next.path, 'server.properties'),
          renderServerProperties(next.port, next.toggles),
          'utf-8'
        )
        return next
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.delete<{ Params: { id: string }; Querystring: { deleteFiles?: string } }>(
    '/api/servers/:id',
    { preHandler: requireRole('admin') },
    async (request) => {
      const { id } = request.params
      // A remote server is destroyed on its own node, but the subdomain and the
      // pointer to it are ours to clean up — so this one call is forwarded by
      // hand rather than by the transparent hook.
      const remoteNode = nodeForInstance(id)
      if (remoteNode) {
        await callNodeAgent(
          remoteNode,
          'DELETE',
          `/api/servers/${encodeURIComponent(id)}?deleteFiles=${request.query.deleteFiles === 'true'}`
        ).catch(() => undefined)
        await releaseInstanceDomain({ id })
        await forgetRemoteInstance(id)
        return { ok: true }
      }

      await instanceManager.stopInstance(id).catch(() => undefined)
      const metadata = await loadInstanceMetadata(id)
      await releaseInstanceDomain(metadata)
      if (request.query.deleteFiles === 'true') {
        await rm(metadata.path, { recursive: true, force: true })
      }
      await removeInstanceFromIndex(id)
      return { ok: true }
    }
  )

  app.get<{ Querystring: { serverType: ServerType } }>(
    '/api/versions',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        return await listVersions(request.query.serverType)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )
}
