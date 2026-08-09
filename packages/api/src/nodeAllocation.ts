import { getPortalStatus, getSettings, type Node } from '@chunkforge/core'
import { listAllNodes } from './portalLink'

/**
 * Choosing where a server should be built when nobody said.
 *
 * The default has always been "this machine", which is right for a desktop
 * install and wrong for a panel that has explicitly turned off local hosting:
 * there, the local node is not a place servers can run at all, so falling back
 * to it produces a server that exists and can never start.
 *
 * So when local hosting is off and no node was named, one is picked. The rules
 * are deliberately dull — a machine that is online, adopted, and has its agent
 * up — because the interesting version of this (weighing CPU and memory to
 * balance load) is a scheduler, and a scheduler that guesses badly is worse
 * than an operator who picks.
 */

/** Why allocation could not choose, phrased for someone who has to fix it. */
export class NoNodeAvailableError extends Error {}

function usable(node: Node): boolean {
  return node.kind === 'portal' && node.status === 'online' && Boolean(node.claimed) && Boolean(node.agentReady)
}

/**
 * How much room a node has left, as a fraction. Higher is emptier.
 *
 * Memory rather than CPU: a Minecraft server's binding constraint is almost
 * always RAM, and a node's CPU reading is a momentary sample that says little
 * about whether another server will fit.
 */
function freeMemoryFraction(node: Node): number {
  const stats = node.stats
  if (!stats || !stats.totalMemoryBytes) return 0
  return 1 - stats.usedMemoryBytes / stats.totalMemoryBytes
}

/**
 * Picks a node for a new server, or returns null when this machine should
 * take it.
 *
 * Returns null — rather than picking — whenever local hosting is on, so the
 * existing behaviour is untouched for everyone who has not opted out of it.
 */
/**
 * The decision itself, given everything it needs.
 *
 * Kept separate from fetching so the rules can be exercised directly against a
 * made-up fleet — which is the only practical way to check what happens when
 * every node is offline, or when two are exactly as empty as each other.
 */
export function chooseNode(
  nodes: Node[],
  options: { hostsLocally: boolean; requested?: string | null }
): string | null {
  // An explicit choice is always honoured, including an explicit "local".
  if (options.requested) return options.requested === 'local' ? null : options.requested
  if (options.hostsLocally) return null

  // Local hosting is off, so this machine is not a candidate.
  const candidates = nodes.filter(usable)

  if (candidates.length === 0) {
    const paired = nodes.filter((node) => node.kind === 'portal')
    throw new NoNodeAvailableError(
      paired.length === 0
        ? 'This panel does not host servers itself and has no nodes to build on. Pair a node, or turn on "Host servers on this machine" in Settings.'
        : 'This panel does not host servers itself, and none of its nodes are online and adopted right now.'
    )
  }

  // Emptiest first, then by name so repeated allocations are predictable
  // rather than depending on whatever order Portal happened to answer in.
  const sorted = [...candidates].sort((a, b) => {
    const diff = freeMemoryFraction(b) - freeMemoryFraction(a)
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
  return sorted[0].id
}

export async function resolveTargetNode(requested?: string | null): Promise<string | null> {
  // Explicit choices need no fleet, so this answers before reaching for one.
  if (requested) return requested === 'local' ? null : requested
  const hostsLocally = getPortalStatus().hostServersLocally !== false
  if (hostsLocally) return null

  const nodes = await listAllNodes().catch(() => [] as Node[])
  return chooseNode(nodes, { hostsLocally, requested })
}

/** Whether this panel builds servers on its own machine. */
export function hostsServersLocally(): boolean {
  return getSettings().portal.hostServersLocally !== false
}
