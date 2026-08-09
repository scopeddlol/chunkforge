import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { loadInstanceMetadata } from '@chunkforge/core'
import {
  canSeeServer,
  effectiveServerRole,
  serverRoleAtLeast,
  type Role,
  type ServerRef,
  type User
} from './model'
import { nodeForInstance } from '../remoteInstances'

/**
 * Enforcing per-server permissions, in exactly one place.
 *
 * Chunkforge has around forty routes shaped `/api/servers/:id/...`. Checking a
 * grant inside each of them would be forty chances to forget, and the one that
 * got forgotten would be the one somebody found. So the check happens here, on
 * the way in, for every one of them at once.
 *
 * This runs *before* the forwarding hook and covers local and remote servers
 * alike — forwarding returns early for a local server, so a check that lived
 * there would silently protect only half of them.
 *
 * The role each method needs is deliberately coarse: reading needs `viewer`,
 * anything else needs `member`. Routes that demand more (deleting a server
 * wants `admin`) still say so themselves; this is a floor, not a ceiling.
 */

/** What a bare HTTP method implies about intent. */
function requiredFor(method: string): Role {
  return method === 'GET' || method === 'HEAD' ? 'viewer' : 'member'
}

function instanceIdFromPath(url: string): string | null {
  const path = url.split('?')[0]
  const match = /^\/api\/servers\/([^/]+)/.exec(path)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Where a server sits, for the purpose of judging a grant.
 *
 * The project id comes from the record when it is cheaply available, and is
 * simply absent otherwise — a remote server's record lives on its node, and
 * fetching it across Portal on every single request to ask which project it is
 * in would put a network round trip in front of forty routes. Absent means
 * project grants do not apply, which is the safe direction: it can only ever
 * withhold a raise, never grant one.
 */
async function locate(instanceId: string): Promise<ServerRef> {
  const nodeId = nodeForInstance(instanceId)
  if (nodeId) return { id: instanceId, nodeId }
  try {
    const metadata = await loadInstanceMetadata(instanceId)
    return { id: instanceId, nodeId: null, projectId: metadata.projectId ?? metadata.groupId ?? null }
  } catch {
    // No such server here. Let the route answer 404 rather than inventing a
    // permission verdict about something that does not exist.
    return { id: instanceId, nodeId: null }
  }
}

export async function registerServerPermissions(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const instanceId = instanceIdFromPath(request.url)
    if (!instanceId) return
    // Node tokens are node-to-panel traffic and carry no user; `requireRole`
    // already refuses to let them drive user routes.
    if (request.nodeId) return
    // Not signed in is not an access decision — the route's own guard answers
    // 401, which is what a signed-out caller actually needs to be told.
    if (!request.user) return

    const server = await locate(instanceId)
    // Published for `requireRole`, which every one of these routes also runs.
    // Without this it would judge the base role and overrule the grant.
    request.serverRole = effectiveServerRole(request.user, server)
    if (!canSeeServer(request.user, server)) {
      // Same answer whether it exists or not: someone without access should
      // not be able to probe which servers are real.
      await reply.code(404).send({ error: 'No such server' })
      return
    }
    if (!serverRoleAtLeast(request.user, server, requiredFor(request.method))) {
      await reply.code(403).send({ error: 'You do not have permission to change that server' })
      return
    }
  })
}

/** Filters a server list down to what the caller may see. */
export function visibleServers<T>(
  user: User | undefined,
  items: T[],
  refOf: (item: T) => ServerRef
): T[] {
  if (!user) return []
  return items.filter((item) => canSeeServer(user, refOf(item)))
}
