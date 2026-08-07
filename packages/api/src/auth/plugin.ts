import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { authStore } from './store'
import { roleAtLeast, type Role, type User } from './model'

export const SESSION_COOKIE = 'cf_session'

declare module 'fastify' {
  interface FastifyRequest {
    user?: User
    /** Set when the caller authenticated with a node token rather than a session. */
    nodeId?: string
  }
}

/**
 * Resolves the caller from either a session cookie (browser and desktop) or a
 * bearer token (nodes, mobile, automation). Routes opt in to protection with
 * `requireRole`, so anything unmarked is deliberately public.
 */
export async function authenticate(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const presented = header.slice(7)
    const resolved = await authStore.resolveApiToken(presented)
    if (resolved) {
      request.user = resolved.user
      if (resolved.record.kind === 'node') request.nodeId = resolved.record.nodeId
      return
    }
    // A session is also a bearer credential. The desktop shell authenticates
    // this way because it has no cookie jar of its own to put one in.
    const user = authStore.resolveSession(presented)
    if (user) request.user = user
    return
  }

  const cookie = request.cookies?.[SESSION_COOKIE]
  if (cookie) {
    const user = authStore.resolveSession(cookie)
    if (user) request.user = user
    return
  }

  // Browsers cannot set headers on a WebSocket handshake, so the event stream
  // alone also accepts the session in the query string. Restricting it to that
  // one path keeps tokens out of logs for every other request.
  if (request.url.startsWith('/api/events')) {
    const token = (request.query as { token?: string } | undefined)?.token
    if (token) {
      const user = authStore.resolveSession(token) ?? (await authStore.resolveApiToken(token))?.user
      if (user) request.user = user
    }
  }
}

/** Route guard: caller must be signed in and hold at least `required`. */
export function requireRole(required: Role) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      await reply.code(401).send({ error: 'Sign in required' })
      return
    }
    // Node tokens are for node-to-panel traffic only; they must not drive user routes.
    if (request.nodeId) {
      await reply.code(403).send({ error: 'Node tokens cannot call this endpoint' })
      return
    }
    if (!roleAtLeast(request.user.role, required)) {
      await reply.code(403).send({ error: `Requires ${required} or higher` })
      return
    }
  }
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate)
}
