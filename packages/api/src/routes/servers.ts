import { existsSync } from 'fs'
import { readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import {
  instanceManager,
  isPortalLinked,
  listInstanceMetadata,
  listVersions,
  loadInstanceMetadata,
  localIpv4,
  removeInstanceFromIndex,
  renderServerProperties,
  saveInstanceMetadata,
  type CreateInstanceConfig,
  type InstanceMetadata,
  type InstanceSummary,
  type PortalDomainBinding,
  type ServerType
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'
import { filterByNodeAccess, guardNodeAccess } from '../auth/nodeAccess'
import { forgetLogLines, recentLogLines } from '../logBuffer'
import {
  callNodeAgent,
  listPortalDomains,
  provisionInstanceDomain,
  releaseInstanceDomain
} from '../portalLink'
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
  const ip = localIpv4()
  return withLiveState({
    ...(summary as InstanceSummary),
    // Stamped here rather than stored: a machine's LAN address changes with
    // the network it is on, so a value persisted at creation time would go
    // stale the first time the box moved or the router handed out a new lease.
    directAddress: ip ? `${ip}:${metadata.port}` : `localhost:${metadata.port}`
  })
}

/**
 * Fills in each server's Portal address from Portal's own domain records.
 *
 * Portal is the authority on which hostname belongs to which server — it is
 * what allocated them. Reading them back from it here means the address shows
 * up for servers that already existed before their binding was ever persisted
 * locally, instead of only for ones created since. A Portal that cannot be
 * reached simply leaves the summaries as they came, so the dashboard still
 * lists every server.
 */
async function withPortalAddresses(summaries: InstanceSummary[]): Promise<InstanceSummary[]> {
  if (!isPortalLinked()) return summaries
  let domains: PortalDomainBinding[]
  try {
    domains = await listPortalDomains()
  } catch {
    return summaries
  }
  const byInstance = new Map(domains.map((domain) => [domain.instanceId, domain]))
  return summaries.map((summary) => {
    const domain = byInstance.get(summary.id)
    if (!domain) return summary
    return { ...summary, portalHostname: domain.hostname, portalPublicPort: domain.publicPort }
  })
}

export async function registerServerRoutes(app: FastifyInstance): Promise<void> {
  // One list, wherever the servers actually run. Remote ones are fetched from
  // their nodes through Portal and appear beside the local ones.
  app.get('/api/servers', { preHandler: requireRole('viewer') }, async (request) => {
    const [local, remote] = await Promise.all([listLocalSummaries(), listRemoteInstances()])
    // A user restricted to some nodes should not see the servers on the rest;
    // node access is about machines, but what a machine *holds* is the part
    // that is actually visible in the UI.
    const visible = filterByNodeAccess(request, [...local, ...remote], (summary) =>
      nodeForInstance(summary.id)
    )
    return withPortalAddresses(visible)
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
        const metadata = withLiveState(await loadInstanceMetadata(request.params.id))
        const ip = localIpv4()
        const withAddress = {
          ...metadata,
          directAddress: ip ? `${ip}:${metadata.port}` : `localhost:${metadata.port}`
        }
        const [enriched] = await withPortalAddresses([withAddress as unknown as InstanceSummary])
        return { ...withAddress, ...enriched }
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
      if (!(await guardNodeAccess(request, reply, targetNode))) return
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

  /**
   * The console backlog. Requested when the log panel mounts, so returning to
   * a server shows what it has already printed instead of an empty box. For a
   * server on a node this is forwarded there by the usual hook, which is what
   * makes a remote console read identically to a local one.
   */
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/servers/:id/logs',
    { preHandler: requireRole('viewer') },
    async (request) => {
      const limit = Number(request.query.limit)
      return recentLogLines(request.params.id, Number.isFinite(limit) && limit > 0 ? limit : undefined)
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

  app.patch<{
    Params: { id: string }
    Body: Partial<InstanceMetadata> & { portalHostname?: string | null; portalPublicPort?: number | null }
  }>(
    '/api/servers/:id',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      const patchBody = request.body ?? {}
      const remoteNode = nodeForInstance(request.params.id)

      /**
       * A port change on a server that lives on a node.
       *
       * The node owns the metadata and server.properties, so the write still
       * goes there — but the Portal route pointing at that server, and the DNS
       * record carrying its port, are this control plane's to fix. Nothing did
       * that before, so changing a port left the subdomain aimed at the old
       * one and players connecting to a closed door.
       */
      if (remoteNode && 'port' in patchBody) {
        if (!(await guardNodeAccess(request, reply, remoteNode))) return
        try {
          const response = await callNodeAgent(
            remoteNode,
            'PATCH',
            `/api/servers/${encodeURIComponent(request.params.id)}`,
            patchBody
          )
          const updated = (await response.json().catch(() => null)) as InstanceMetadata | null
          if (!response.ok || !updated) {
            return reply.code(response.status || 502).send({ error: 'That node would not accept the change.' })
          }
          // Re-provisioning is idempotent for a server that already has an
          // address: the hostname is kept and only the target port moves.
          await provisionInstanceDomain({ ...updated, nodeId: remoteNode }).catch(() => null)
          return updated
        } catch (err) {
          return reply.code(502).send({ error: (err as Error).message })
        }
      }

      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        const patch = patchBody
        const next: InstanceMetadata = {
          ...metadata,
          name: patch.name ?? metadata.name,
          port: patch.port ?? metadata.port,
          minRamMb: patch.minRamMb ?? metadata.minRamMb,
          maxRamMb: patch.maxRamMb ?? metadata.maxRamMb,
          accentColor: patch.accentColor ?? metadata.accentColor,
          ramAllocatedMb: patch.maxRamMb ?? metadata.maxRamMb,
          toggles: patch.toggles ?? metadata.toggles,
          launchArgs: patch.launchArgs ?? metadata.launchArgs,
          // Portal, via `portalLink.ts`, is the only caller that sends these —
          // it is how a remote server's binding reaches the node's own
          // metadata file, the copy `GET /api/servers/:id` actually serves.
          portalHostname:
            'portalHostname' in patch ? (patch.portalHostname ?? undefined) : metadata.portalHostname,
          portalPublicPort:
            'portalPublicPort' in patch ? (patch.portalPublicPort ?? undefined) : metadata.portalPublicPort,
          // Group membership arrives here too — from the group routes, and on
          // a node from the control plane that owns the group list. Leaving it
          // out of this whitelist meant those writes were accepted and then
          // silently dropped.
          groupId: 'groupId' in patch ? (patch.groupId ?? null) : metadata.groupId,
          projectId: patch.projectId ?? metadata.projectId
        }
        await saveInstanceMetadata(next)
        await writeFile(
          join(next.path, 'server.properties'),
          renderServerProperties(next.port, next.toggles),
          'utf-8'
        )
        // A local server can hold a Portal address too, when this machine is
        // offered to Portal as a node. Same reasoning as the remote path: the
        // route has to follow the port.
        if (next.port !== metadata.port && next.portalHostname) {
          await provisionInstanceDomain(next).catch(() => null)
        }
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
        await releaseInstanceDomain({ id, nodeId: remoteNode })
        await forgetRemoteInstance(id)
        forgetLogLines(id)
        return { ok: true }
      }

      await instanceManager.stopInstance(id).catch(() => undefined)
      const metadata = await loadInstanceMetadata(id)
      await releaseInstanceDomain(metadata)
      if (request.query.deleteFiles === 'true') {
        await rm(metadata.path, { recursive: true, force: true })
      }
      await removeInstanceFromIndex(id)
      forgetLogLines(id)
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
