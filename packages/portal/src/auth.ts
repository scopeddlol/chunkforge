import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { portalStore, type PortalUser } from './store'

export const PORTAL_SESSION_COOKIE = 'cf_portal_session'

declare module 'fastify' {
  interface FastifyRequest {
    portalUser?: PortalUser
    /** Set when the caller presented a node token. */
    portalNodeId?: string
    /** Set when the caller presented a control-plane token. */
    portalClientId?: string
  }
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface Session {
  token: string
  userId: string
  expiresAt: number
}

// In memory on purpose: a Portal restart signing its operators out is a fair
// trade for never writing bearer material to disk.
const sessions = new Map<string, Session>()

/**
 * scrypt from Node's standard library rather than bcrypt or argon2, so
 * self-hosting a Portal needs no native build toolchain.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function newToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function needsSetup(): boolean {
  return portalStore.users().length === 0
}

export async function createOwner(username: string, password: string): Promise<PortalUser> {
  if (!needsSetup()) throw new Error('Portal already has an owner account.')
  if (username.trim().length < 3) throw new Error('Username must be at least 3 characters.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  return portalStore.addUser({
    id: randomUUID(),
    username: username.trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  })
}

export function createSession(userId: string): string {
  const token = newToken()
  sessions.set(token, { token, userId, expiresAt: Date.now() + SESSION_TTL_MS })
  return token
}

export function revokeSession(token: string): void {
  sessions.delete(token)
}

export function resolveSession(token: string): PortalUser | null {
  const session = sessions.get(token)
  if (!session) return null
  if (session.expiresAt < Date.now()) {
    sessions.delete(token)
    return null
  }
  return portalStore.findUserById(session.userId) ?? null
}

/**
 * Resolves whichever of Portal's three caller types made this request: an
 * operator in the admin UI, a paired node, or a paired control plane. They are
 * kept apart deliberately — a node token must never be able to reconfigure the
 * zone, and a control plane must never be able to answer as a node.
 */
export async function authenticatePortal(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  // A WebSocket handshake cannot carry an Authorization header, so the two
  // channel routes accept their token in the query string instead.
  const queryToken =
    request.url.startsWith('/api/node/channel') || request.url.startsWith('/api/client/channel')
      ? (request.query as { token?: string } | undefined)?.token
      : undefined
  const presented = bearer ?? queryToken

  if (presented) {
    const hash = hashToken(presented)
    const node = portalStore.findNodeByTokenHash(hash)
    if (node) {
      request.portalNodeId = node.id
      return
    }
    const client = portalStore.findClientByTokenHash(hash)
    if (client) {
      request.portalClientId = client.id
      return
    }
    const user = resolveSession(presented)
    if (user) request.portalUser = user
    return
  }

  const cookie = request.cookies?.[PORTAL_SESSION_COOKIE]
  if (cookie) {
    const user = resolveSession(cookie)
    if (user) request.portalUser = user
  }
}

/** Route guard for the admin surface. */
export async function requireOperator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.portalUser) {
    await reply.code(401).send({ error: 'Sign in required' })
  }
}

/** Route guard for node-to-Portal traffic. */
export async function requireNode(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.portalNodeId) {
    await reply.code(401).send({ error: 'Node token required' })
  }
}

/** Route guard for control-plane-to-Portal traffic. */
export async function requireClient(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.portalClientId) {
    await reply.code(401).send({ error: 'Client token required' })
  }
}

export async function registerPortalAuth(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticatePortal)
}
