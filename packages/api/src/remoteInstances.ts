import {
  getSettings,
  saveSettings,
  type InstanceSummary,
  type RemoteInstanceRef
} from '@chunkforge/core'
import { callNodeAgent, listAllNodes } from './portalLink'

/**
 * Servers that live on a Portal node rather than on this machine.
 *
 * The node holds the real record — its files, its process, its metadata. This
 * control plane keeps only a pointer per server so it knows where to forward a
 * request, which is what makes `/api/servers/:id/...` work identically whether
 * the server is in this room or on someone else's Docker host.
 */

export function listRemoteRefs(): RemoteInstanceRef[] {
  return getSettings().remoteInstances ?? []
}

/** The node a server lives on, or null when it is local. */
export function nodeForInstance(instanceId: string): string | null {
  return listRemoteRefs().find((ref) => ref.instanceId === instanceId)?.nodeId ?? null
}

export async function rememberRemoteInstance(ref: RemoteInstanceRef): Promise<void> {
  const existing = listRemoteRefs().filter((entry) => entry.instanceId !== ref.instanceId)
  await saveSettings({ remoteInstances: [...existing, ref] })
}

export async function forgetRemoteInstance(instanceId: string): Promise<void> {
  await saveSettings({
    remoteInstances: listRemoteRefs().filter((ref) => ref.instanceId !== instanceId)
  })
}

/**
 * Creates a server on a remote node by handing the whole wizard config to that
 * node's own Core API. The node does the real work — downloading the jar,
 * fetching Java, first boot — because it is the machine that will run it.
 */
export async function createRemoteInstance(
  nodeId: string,
  config: unknown
): Promise<{ id: string; name: string; port: number }> {
  // `nodeId: local` on the far side: from the node's point of view, it *is*
  // the local machine. Leaving our id in would have it try to forward onward.
  const body = { ...(config as Record<string, unknown>), nodeId: 'local' }
  const response = await callNodeAgent(nodeId, 'POST', '/api/servers', body)
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(String(payload.error ?? `The node refused the request (HTTP ${response.status})`))
  }
  const created = payload as unknown as { id: string; name: string; port: number }
  await rememberRemoteInstance({
    instanceId: created.id,
    nodeId,
    name: created.name,
    createdAt: new Date().toISOString()
  })
  return created
}

/**
 * Every remote server, gathered from the nodes this control plane has claimed.
 *
 * One unreachable node must not empty the dashboard, so failures are swallowed
 * per node — the servers you can see are the ones whose host answered.
 */
export async function listRemoteInstances(): Promise<InstanceSummary[]> {
  const refs = listRemoteRefs()
  if (refs.length === 0) return []

  const nodes = await listAllNodes()
  const reachable = new Set(
    nodes.filter((node) => node.kind === 'portal' && node.claimed && node.agentReady).map((n) => n.id)
  )
  const byNode = new Map<string, RemoteInstanceRef[]>()
  for (const ref of refs) {
    if (!reachable.has(ref.nodeId)) continue
    byNode.set(ref.nodeId, [...(byNode.get(ref.nodeId) ?? []), ref])
  }

  const collected = await Promise.all(
    [...byNode.entries()].map(async ([nodeId, nodeRefs]) => {
      try {
        const response = await callNodeAgent(nodeId, 'GET', '/api/servers')
        if (!response.ok) return []
        const servers = (await response.json()) as InstanceSummary[]
        const known = new Set(nodeRefs.map((ref) => ref.instanceId))
        return servers
          .filter((server) => known.has(server.id))
          .map((server) => ({ ...server, nodeId }))
      } catch {
        return []
      }
    })
  )
  return collected.flat()
}
