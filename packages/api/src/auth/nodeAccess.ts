import type { FastifyReply, FastifyRequest } from 'fastify'
import { LOCAL_NODE_ID } from '@chunkforge/core'
import { canUseNode } from './model'

/**
 * Enforcing which nodes a user may touch.
 *
 * The rule lives in one place because it has to be applied in three quite
 * different shapes: filtering a list, guarding an action, and vetoing a
 * forwarded request. Spreading the predicate across those call sites is how
 * one of them ends up disagreeing with the others, which for an access check
 * means a user seeing a machine they were never granted.
 *
 * A node token is not a user and is never restricted here — node-to-panel
 * traffic authenticates as the node, and `requireRole` already refuses to let
 * node tokens drive user routes.
 */

/** Whether the caller may use a node. Unauthenticated callers may not. */
export function requestCanUseNode(request: FastifyRequest, nodeId: string | null | undefined): boolean {
  if (request.nodeId) return true
  if (!request.user) return false
  // A node with no id is this machine, which is the one node everybody who can
  // reach the panel at all can already see.
  return canUseNode(request.user, nodeId || LOCAL_NODE_ID)
}

/**
 * Guard for a route that acts on one node. Replies 403 and returns false when
 * the caller has no business there, so handlers read as
 * `if (!(await guardNode(...))) return`.
 */
export async function guardNodeAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  nodeId: string | null | undefined
): Promise<boolean> {
  if (requestCanUseNode(request, nodeId)) return true
  // Deliberately the same message whether the node exists or not: someone
  // without access should not be able to probe which node ids are real.
  await reply.code(403).send({ error: 'You do not have access to that node' })
  return false
}

/** Filters a list of node-bearing records down to what the caller may see. */
export function filterByNodeAccess<T>(
  request: FastifyRequest,
  items: T[],
  nodeIdOf: (item: T) => string | null | undefined
): T[] {
  if (request.nodeId || !request.user) return items
  return items.filter((item) => requestCanUseNode(request, nodeIdOf(item)))
}
