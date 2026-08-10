import {
  extraEndpoints,
  loadInstanceMetadata,
  type CreateInstanceConfig,
  type InstanceMetadata
} from '@chunkforge/core'
import { callNodeAgent, provisionInstanceDomain, publishEndpointWithRetry } from './portalLink'
import { createRemoteInstance, forgetRemoteInstance, nodeForInstance, rememberRemoteInstance } from './remoteInstances'

/**
 * Moving a server from one machine to another without changing its address.
 *
 * The transfer is a backup, moved in pieces and restored — not a raw copy of
 * the server folder. A backup is a thing both ends already know how to make
 * and unpack, it excludes the parts that should not travel (jars the target
 * will fetch for itself, logs about a machine the server no longer lives on),
 * and it means a failed migration leaves an archive rather than a half-copied
 * directory.
 *
 * Downtime is the stop that makes the archive consistent, plus the transfer.
 * There is no way around the first — a world copied while it is being written
 * is a corrupted world — but everything before it happens with the server
 * still up, and the address moves only once the new copy is in place.
 */

const CHUNK_BYTES = 4 * 1024 * 1024

export interface MigrationProgress {
  stage: 'preparing' | 'backing-up' | 'transferring' | 'restoring' | 'switching' | 'cleaning' | 'done'
  message: string
  percent: number | null
}

type Report = (progress: MigrationProgress) => void

interface ChunkResponse {
  total: number
  offset: number
  bytes: number
  data: string
}

/** Reads one server's record, wherever it lives. */
async function readMetadata(instanceId: string, nodeId: string | null): Promise<InstanceMetadata> {
  if (!nodeId) return loadInstanceMetadata(instanceId)
  const response = await callNodeAgent(nodeId, 'GET', `/api/servers/${encodeURIComponent(instanceId)}`)
  if (!response.ok) throw new Error('Could not read that server from its current node.')
  return (await response.json()) as InstanceMetadata
}

/** Runs a request against a node, or against this machine when nodeId is null. */
async function call(
  nodeId: string | null,
  method: string,
  path: string,
  body?: unknown,
  localBase?: string
): Promise<Response> {
  if (nodeId) return callNodeAgent(nodeId, method, path, body)
  // A local endpoint still goes over HTTP so both sides of a migration use one
  // code path; the alternative is two implementations that drift.
  if (!localBase) throw new Error('No local API address available for migration.')
  return fetch(`${localBase}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

export interface MigrateOptions {
  instanceId: string
  targetNodeId: string
  /** Base URL and auth for talking to this machine's own API, when it is an end. */
  local?: { baseUrl: string; token?: string }
  onProgress?: Report
}

export async function migrateInstance(options: MigrateOptions): Promise<InstanceMetadata> {
  const report: Report = options.onProgress ?? (() => undefined)
  const { instanceId, targetNodeId } = options

  const sourceNode = nodeForInstance(instanceId)
  if (sourceNode === targetNodeId) throw new Error('That server is already on that node.')

  report({ stage: 'preparing', message: 'Reading the server’s configuration…', percent: 0 })
  const metadata = await readMetadata(instanceId, sourceNode)

  // The new server is built first, while the old one is still serving players.
  report({ stage: 'preparing', message: 'Creating the server on the new node…', percent: 5 })
  const config: CreateInstanceConfig = {
    name: metadata.name,
    serverType: metadata.serverType,
    minecraftVersion: metadata.minecraftVersion,
    port: metadata.port,
    minRamMb: metadata.minRamMb,
    maxRamMb: metadata.maxRamMb,
    toggles: metadata.toggles,
    accentColor: metadata.accentColor,
    installLocation: null,
    groupId: metadata.groupId ?? null,
    nodeId: targetNodeId
  }
  const created = await createRemoteInstance(targetNodeId, config)

  // Only now does anyone lose service.
  report({ stage: 'backing-up', message: 'Stopping the server and taking a backup…', percent: 15 })
  await call(sourceNode, 'POST', `/api/servers/${encodeURIComponent(instanceId)}/stop`, undefined, options.local?.baseUrl).catch(
    () => undefined
  )
  const backupResponse = await call(
    sourceNode,
    'POST',
    `/api/servers/${encodeURIComponent(instanceId)}/backups`,
    { contents: { worlds: true, addons: true, configs: true } },
    options.local?.baseUrl
  )
  if (!backupResponse.ok) throw new Error('Could not back up the server before moving it.')
  const backup = (await backupResponse.json()) as { filename: string }

  report({ stage: 'transferring', message: 'Moving the data across…', percent: 25 })
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const chunkResponse = await call(
      sourceNode,
      'GET',
      `/api/servers/${encodeURIComponent(instanceId)}/backups/${encodeURIComponent(backup.filename)}/download?offset=${offset}&length=${CHUNK_BYTES}`,
      undefined,
      options.local?.baseUrl
    )
    if (!chunkResponse.ok) throw new Error('The old node stopped sending the backup.')
    const chunk = (await chunkResponse.json()) as ChunkResponse
    total = chunk.total
    if (chunk.bytes === 0) break

    const upload = await callNodeAgent(
      targetNodeId,
      'POST',
      `/api/servers/${encodeURIComponent(created.id)}/backups/upload`,
      { filename: backup.filename, offset, data: chunk.data }
    )
    if (!upload.ok) throw new Error('The new node would not accept the backup.')

    offset += chunk.bytes
    report({
      stage: 'transferring',
      message: `Moving the data across… ${Math.round((offset / total) * 100)}%`,
      percent: 25 + Math.round((offset / total) * 45)
    })
  }

  report({ stage: 'restoring', message: 'Unpacking on the new node…', percent: 75 })
  const restore = await callNodeAgent(
    targetNodeId,
    'POST',
    `/api/servers/${encodeURIComponent(created.id)}/backups/${encodeURIComponent(backup.filename)}/restore`
  )
  if (!restore.ok) throw new Error('The new node could not unpack the backup.')

  /**
   * The address moves last, and moves rather than being reissued.
   *
   * Portal keys a domain by instance id, so re-allocating for the same id
   * returns the same hostname and simply re-points it at the new node. That is
   * what keeps `survival.example.com` working across the move — players never
   * learn a new address, and the DNS record is updated rather than replaced.
   */
  report({ stage: 'switching', message: 'Moving the address to the new node…', percent: 85 })
  await provisionInstanceDomain(
    { ...metadata, id: created.id, nodeId: targetNodeId, port: created.port, portalHostname: undefined },
    { force: true, label: metadata.portalHostname?.split('.')[0] }
  ).catch(() => null)

  /**
   * The extra endpoints move with the server.
   *
   * They are part of what a server *is* — a voice port, a map port — and a
   * migrated server that arrived without them was a quietly broken server:
   * the services were gone, and Portal was still relaying their public ports
   * to a node that no longer ran anything. The metadata travels first so the
   * new node declares the ports, then each mapping is re-pointed, which is
   * what closes the old node's half of the route.
   */
  const movingEndpoints = extraEndpoints(metadata)
  if (movingEndpoints.length > 0) {
    report({ stage: 'switching', message: 'Moving service ports…', percent: 88 })
    await callNodeAgent(targetNodeId, 'PATCH', `/api/servers/${encodeURIComponent(created.id)}`, {
      endpoints: movingEndpoints
    }).catch(() => undefined)

    for (const endpoint of movingEndpoints) {
      // Best-effort per endpoint: a voice port that could not be re-published
      // must not undo a migration that has otherwise completed.
      await publishEndpointWithRetry({
        instanceId: created.id,
        nodeId: targetNodeId,
        endpoint
      }).catch(() => null)
    }
  }

  report({ stage: 'cleaning', message: 'Removing the old copy…', percent: 92 })
  await call(
    sourceNode,
    'DELETE',
    `/api/servers/${encodeURIComponent(instanceId)}?deleteFiles=true`,
    undefined,
    options.local?.baseUrl
  ).catch(() => undefined)
  if (sourceNode) await forgetRemoteInstance(instanceId)
  await rememberRemoteInstance({
    instanceId: created.id,
    nodeId: targetNodeId,
    name: created.name,
    createdAt: new Date().toISOString()
  })

  report({ stage: 'done', message: 'Moved.', percent: 100 })
  return created as unknown as InstanceMetadata
}
