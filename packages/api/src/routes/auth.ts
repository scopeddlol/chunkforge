import type { FastifyInstance, FastifyReply } from 'fastify'
import { authStore } from '../auth/store'
import {
  canConfigurePersonalNode,
  roleAtLeast,
  verifyPassword,
  type Role,
  type User
} from '../auth/model'
import { requireRole, SESSION_COOKIE } from '../auth/plugin'

interface Credentials {
  username: string
  password: string
}

interface UserGrantBody {
  role?: Role
  /** Node ids this account may use. Omit for "every node". */
  nodeAccess?: string[]
  canConfigurePersonalNode?: boolean
}

/** Everything about a user that is safe to hand to an admin UI. */
function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    disabled: user.disabled ?? false,
    nodeAccess: user.nodeAccess ?? null,
    canConfigurePersonalNode: user.canConfigurePersonalNode ?? false,
    createdAt: user.createdAt
  }
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /** Lets the UI decide between the setup wizard and the sign-in screen. */
  app.get('/api/auth/status', async () => ({
    needsSetup: authStore.needsSetup()
  }))

  /** First run only: creates the owner account. Closed once a user exists. */
  app.post<{ Body: Credentials }>('/api/auth/setup', async (request, reply) => {
    if (!authStore.needsSetup()) {
      return reply.code(409).send({ error: 'Chunkforge has already been set up' })
    }
    const { username, password } = request.body ?? {}
    if (!username?.trim() || !password || password.length < 8) {
      return reply.code(400).send({ error: 'Username and a password of at least 8 characters are required' })
    }

    const user = await authStore.createUser(username.trim(), password, 'owner')
    const session = authStore.createSession(user.id, 'setup')
    setSessionCookie(reply, session.token)
    return { id: user.id, username: user.username, role: user.role }
  })

  app.post<{ Body: Credentials }>('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body ?? {}
    const user = username ? authStore.findByUsername(username) : undefined

    // Same response for unknown user and wrong password, so the endpoint
    // doesn't confirm which usernames exist.
    if (!user || user.disabled || !verifyPassword(password ?? '', user.passwordHash)) {
      return reply.code(401).send({ error: 'Incorrect username or password' })
    }

    const session = authStore.createSession(user.id)
    setSessionCookie(reply, session.token)
    return { id: user.id, username: user.username, role: user.role }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE]
    if (token) authStore.revokeSession(token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/me', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Sign in required' })
    const { id, username, role, projectGrants, nodeAccess } = request.user
    // The two capability flags are derived, not stored: the UI should not have
    // to re-implement "admins are never restricted" to decide what to render.
    return {
      id,
      username,
      role,
      projectGrants,
      nodeAccess: roleAtLeast(role, 'admin') ? undefined : nodeAccess,
      canConfigurePersonalNode: canConfigurePersonalNode(request.user),
      isAdmin: roleAtLeast(role, 'admin')
    }
  })

  // ---- user administration ----

  app.get('/api/users', { preHandler: requireRole('admin') }, async () =>
    authStore.listUsers().map(publicUser)
  )

  app.post<{ Body: Credentials & UserGrantBody }>(
    '/api/users',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { username, password, role = 'member', nodeAccess, canConfigurePersonalNode: personal } =
        request.body ?? {}
      if (!username?.trim() || !password || password.length < 8) {
        return reply.code(400).send({ error: 'Username and a password of at least 8 characters are required' })
      }
      // Only an owner may mint another admin or owner.
      if ((role === 'admin' || role === 'owner') && request.user?.role !== 'owner') {
        return reply.code(403).send({ error: 'Only the owner can create admin accounts' })
      }
      try {
        const user = await authStore.createUser(username.trim(), password, role, {
          nodeAccess: Array.isArray(nodeAccess) ? nodeAccess : undefined,
          canConfigurePersonalNode: personal
        })
        return publicUser(user)
      } catch (err) {
        return reply.code(409).send({ error: (err as Error).message })
      }
    }
  )

  app.patch<{
    Params: { id: string }
    Body: { role?: Role; disabled?: boolean; nodeAccess?: string[] | null; canConfigurePersonalNode?: boolean }
  }>(
    '/api/users/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const body = request.body ?? {}
      // Promoting someone to admin hands out the ability to promote others, so
      // it stays an owner-only act — the same rule as creating an admin.
      if ((body.role === 'admin' || body.role === 'owner') && request.user?.role !== 'owner') {
        return reply.code(403).send({ error: 'Only the owner can grant admin' })
      }
      // Nobody may lock, demote, or restrict themselves out of the panel by
      // accident; an admin editing their own row is almost always a slip.
      if (request.params.id === request.user?.id && (body.role || body.disabled)) {
        return reply.code(400).send({ error: 'You cannot change your own role or disable yourself' })
      }
      try {
        const user = await authStore.updateUser(request.params.id, body)
        return publicUser(user)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /** An admin resetting someone else's password, e.g. after a lockout. */
  app.post<{ Params: { id: string }; Body: { password?: string } }>(
    '/api/users/:id/password',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const password = request.body?.password
      if (!password || password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' })
      }
      const target = authStore.findUser(request.params.id)
      if (!target) return reply.code(404).send({ error: 'No such user' })
      // An admin resetting the owner's password would be a way to take the
      // panel; only the owner may change the owner's password.
      if (target.role === 'owner' && request.user?.id !== target.id) {
        return reply.code(403).send({ error: "Only the owner can change the owner's password" })
      }
      await authStore.setPassword(target.id, password)
      return { ok: true }
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/api/users/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      try {
        await authStore.deleteUser(request.params.id)
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Body: { password: string } }>('/api/auth/password', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Sign in required' })
    const password = request.body?.password
    if (!password || password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' })
    }
    await authStore.setPassword(request.user.id, password)
    return { ok: true }
  })

  // ---- invites ----
  //
  // An invite is how someone joins without an admin typing a password for
  // them. The grants ride on the code, so accepting one never lets the new
  // account choose its own role or node access.

  app.get('/api/invites', { preHandler: requireRole('admin') }, async () => authStore.listInvites())

  app.post<{
    Body: UserGrantBody & { note?: string; uses?: number; expiresInDays?: number }
  }>('/api/invites', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = request.body ?? {}
    const role = body.role ?? 'member'
    if ((role === 'admin' || role === 'owner') && request.user?.role !== 'owner') {
      return reply.code(403).send({ error: 'Only the owner can invite admins' })
    }
    if (role === 'owner') {
      return reply.code(400).send({ error: 'There can only be one owner' })
    }
    const { code, record } = await authStore.createInvite(request.user!.id, {
      role,
      nodeAccess: Array.isArray(body.nodeAccess) ? body.nodeAccess : undefined,
      canConfigurePersonalNode: body.canConfigurePersonalNode,
      note: body.note,
      uses: body.uses,
      expiresInDays: body.expiresInDays
    })
    const { codeHash: _hash, ...rest } = record
    // The plaintext is returned exactly once, here.
    return { code, invite: rest }
  })

  app.delete<{ Params: { id: string } }>(
    '/api/invites/:id',
    { preHandler: requireRole('admin') },
    async (request) => {
      // Revoked rather than deleted, so the record of who used a code survives.
      await authStore.revokeInvite(request.params.id)
      return { ok: true }
    }
  )

  /**
   * Public: lets the join page confirm a code is real before asking someone to
   * choose a password. It reveals only the role being offered — an invalid code
   * is a flat 404 with nothing to enumerate.
   */
  app.get<{ Params: { code: string } }>('/api/invites/:code/preview', async (request, reply) => {
    const described = authStore.describeInvite(request.params.code)
    if (!described) return reply.code(404).send({ error: 'That invite code is not valid' })
    return described
  })

  /** Public: redeems a code into an account and signs the new user straight in. */
  app.post<{ Body: Credentials & { code: string } }>('/api/invites/accept', async (request, reply) => {
    const { code, username, password } = request.body ?? {}
    if (!code?.trim()) return reply.code(400).send({ error: 'An invite code is required' })
    if (!username?.trim() || !password || password.length < 8) {
      return reply.code(400).send({ error: 'Username and a password of at least 8 characters are required' })
    }
    try {
      const user = await authStore.acceptInvite(code, username.trim(), password)
      const session = authStore.createSession(user.id, 'invite')
      setSessionCookie(reply, session.token)
      return { id: user.id, username: user.username, role: user.role }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // ---- API tokens ----

  app.get('/api/tokens', { preHandler: requireRole('member') }, async (request) =>
    authStore.listApiTokens(request.user?.role === 'owner' ? undefined : request.user?.id)
  )

  app.post<{ Body: { name: string } }>(
    '/api/tokens',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      const name = request.body?.name?.trim()
      if (!name) return reply.code(400).send({ error: 'A token name is required' })
      const { token, record } = await authStore.createApiToken(request.user!.id, name)
      // The plaintext is returned exactly once, here.
      return { token, id: record.id, name: record.name, createdAt: record.createdAt }
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/api/tokens/:id',
    { preHandler: requireRole('member') },
    async (request) => {
      await authStore.revokeApiToken(request.params.id)
      return { ok: true }
    }
  )
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // Secure would break plain-HTTP LAN and localhost deployments, which are
    // the common self-hosted case; a reverse proxy terminating TLS still works.
    secure: false,
    maxAge: 30 * 24 * 60 * 60
  })
}
