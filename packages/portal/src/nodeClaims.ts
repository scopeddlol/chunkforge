import type { PortalNode } from './types'

/**
 * Which control planes have adopted a node.
 *
 * Nodes used to have a single owner, so records written by older builds carry
 * `claimedByClientId` instead of the list. Reading through here means every
 * call site sees one shape and no migration pass has to run over the store.
 */
export function nodeClaimants(node: Pick<PortalNode, 'claimedByClientIds' | 'claimedByClientId'>): string[] {
  if (node.claimedByClientIds?.length) return node.claimedByClientIds
  return node.claimedByClientId ? [node.claimedByClientId] : []
}

export function hasClaimed(
  node: Pick<PortalNode, 'claimedByClientIds' | 'claimedByClientId'>,
  clientId: string | undefined
): boolean {
  return Boolean(clientId) && nodeClaimants(node).includes(clientId as string)
}

/** Rewrites a node's claim list, dropping the legacy single-owner field. */
export function setClaimants(node: PortalNode, clientIds: string[]): void {
  node.claimedByClientIds = [...new Set(clientIds)]
  delete node.claimedByClientId
}
