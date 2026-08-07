import type { Node, NodeStats } from '../types/index'
import { LOCAL_NODE_ID } from '../types/models'
import { getSettings, saveSettings } from './settingsStore'

/**
 * The local node only.
 *
 * Remote nodes used to be paired and stored here, which meant two Chunkforge
 * installs attached to the same Portal each kept their own half-truth about
 * which machines existed. Pairing now happens once, at the Portal, and remote
 * nodes are read from it live — see `portalLink` in `@chunkforge/api`.
 */

export function listLocalNodes(): Node[] {
  return getSettings().nodes.filter((node) => node.kind === 'local')
}

export function getLocalNode(): Node {
  return (
    listLocalNodes()[0] ?? {
      id: LOCAL_NODE_ID,
      name: 'This machine',
      kind: 'local',
      status: 'online'
    }
  )
}

export async function updateLocalNodeStats(stats: NodeStats): Promise<Node> {
  const settings = getSettings()
  const existing = settings.nodes.find((node) => node.kind === 'local')
  const next: Node = {
    ...(existing ?? { id: LOCAL_NODE_ID, name: 'This machine', kind: 'local' as const }),
    stats,
    lastSeenAt: new Date().toISOString(),
    status: 'online'
  }
  await saveSettings({
    nodes: [next, ...settings.nodes.filter((node) => node.kind !== 'local')]
  })
  return next
}
