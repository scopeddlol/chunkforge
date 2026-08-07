import type { FastifyInstance, FastifyReply } from 'fastify'
import { authStore } from '../auth/store'
import { verifyPassword, type Role } from '../auth/model'
import { requireRole, SESSION_COOKIE } from '../auth/plugin'

interface Credentials {
  username: string
  password: string
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
    const { id, username, role, projectGrants } = request.user
    return { id, username, role, projectGrants }
  })

  // ---- user administration ----

  app.get('/api/users', { preHandler: requireRole('admin') }, async () => authStore.listUsers())

  app.post<{ Body: Credentials & { role?: Role } }>(
    '/api/users',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { username, password, role = 'member' } = request.body ?? {}
      if (!username?.trim() || !password || password.length < 8) {
        return reply.code(400).send({ error: 'Username and a password of at least 8 characters are required' })
      }
      // Only an owner may mint another admin or owner.
      if ((role === 'admin' || role === 'owner') && request.user?.role !== 'owner') {
        return reply.code(403).send({ error: 'Only the owner can create admin accounts' })
      }
      try {
        const user = await authStore.createUser(username.trim(), password, role)
        return { id: user.id, username: user.username, role: user.role }
      } catch (err) {
        return reply.code(409).send({ error: (err as Error).message })
      }
    }
  )

  app.patch<{ Params: { id: string }; Body: { role?: Role; disabled?: boolean } }>(
    '/api/users/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      try {
        const user = await authStore.updateUser(request.params.id, request.body ?? {})
        return { id: user.id, username: user.username, role: user.role, disabled: user.disabled }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
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
