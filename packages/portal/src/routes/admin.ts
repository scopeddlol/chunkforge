import type { FastifyInstance } from 'fastify'
import {
  PORTAL_SESSION_COOKIE,
  createOwner,
  createSession,
  needsSetup,
  hashPassword,
  requireOperator,
  resolveSession,
  revokeSession,
  verifyPassword
} from '../auth'
import { normalizeZone } from '../domains'
import {
  connectCloudflare,
  disconnectCloudflare,
  isCloudflareConfigured,
  syncWildcardRecord,
  testCloudflareConnection
} from '../dnsProvider'
import { isCloudflareManaged, isPublicBaseUrlManaged } from '../environment'
import { broadcastPortal, subscribePortalEvents } from '../events'
import { portalRelay } from '../relay'
import { portalStore } from '../store'
import { buildOverview, toNodeView } from '../views'
import type { PortalConfig, PortalConfigView, PairingKind } from '../types'

/** Never hands the raw token back — only whether one is set, and by whom. */
function toConfigView(config: PortalConfig): PortalConfigView {
  const { cloudflareApiToken: _token, ...rest } = config
  return {
    ...rest,
    publicBaseUrlManaged: isPublicBaseUrlManaged(),
    cloudflareApiTokenManaged: isCloudflareManaged(),
    cloudflareConfigured: isCloudflareConfigured()
  }
}

/**
 * The operator-facing surface — everything Portal's own admin UI talks to.
 *
 * Note what is absent: there is no server list, no console, no add-on search.
 * Portal manages names, routes, and who is allowed to attach. Managing the
 * Minecraft servers themselves is the Chunkforge UI's job, and it does that
 * against its own Core API, not this one.
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // ---- auth ----

  app.get('/api/auth/status', async () => ({ needsSetup: needsSetup() }))

  app.post<{ Body: { username: string; password: string } }>(
    '/api/auth/setup',
    async (request, reply) => {
      try {
        const user = await createOwner(request.body?.username ?? '', request.body?.password ?? '')
        setSessionCookie(reply, createSession(user.id))
        return { id: user.id, username: user.username }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Body: { username: string; password: string } }>(
    '/api/auth/login',
    async (request, reply) => {
      const user = portalStore.findUser(request.body?.username ?? '')
      if (!user || !verifyPassword(request.body?.password ?? '', user.passwordHash)) {
        return reply.code(401).send({ error: 'Incorrect username or password' })
      }
      setSessionCookie(reply, createSession(user.id))
      return { id: user.id, username: user.username }
    }
  )

  app.post('/api/auth/logout', async (request, reply) => {
    const cookie = request.cookies?.[PORTAL_SESSION_COOKIE]
    if (cookie) revokeSession(cookie)
    void reply.clearCookie(PORTAL_SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/me', { preHandler: requireOperator }, async (request) => ({
    id: request.portalUser!.id,
    username: request.portalUser!.username
  }))

  app.post<{ Body: { password: string } }>(
    '/api/auth/password',
    { preHandler: requireOperator },
    async (request, reply) => {
      const password = request.body?.password ?? ''
      if (password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters.' })
      }
      await portalStore.setUserPassword(request.portalUser!.id, hashPassword(password))
      return { ok: true }
    }
  )

  // ---- overview and config ----

  app.get('/api/overview', { preHandler: requireOperator }, async () => buildOverview())

  app.get('/api/config', { preHandler: requireOperator }, async () => toConfigView(portalStore.config()))

  app.patch<{ Body: Partial<PortalConfig> }>(
    '/api/config',
    { preHandler: requireOperator },
    async (request, reply) => {
      const patch = { ...request.body }
      // The environment owns the domain when it supplies one. Silently keeping
      // the stored value would be worse than refusing: the operator would see
      // their edit accepted and then reverted on the next restart.
      if (patch.publicBaseUrl !== undefined && isPublicBaseUrlManaged()) {
        return reply.code(409).send({
          error: 'The public URL is set by CHUNKFORGE_PORTAL_DOMAIN on this deployment.'
        })
      }
      // Cloudflare credentials go through their own routes, which resolve the
      // zone id rather than trusting whatever the caller sent — a raw PATCH
      // here could not do that resolution.
      delete patch.cloudflareApiToken
      delete patch.cloudflareZoneId
      if (patch.zoneSuffix !== undefined) patch.zoneSuffix = normalizeZone(patch.zoneSuffix)
      if (
        patch.publicPortRangeStart !== undefined &&
        patch.publicPortRangeEnd !== undefined &&
        patch.publicPortRangeStart > patch.publicPortRangeEnd
      ) {
        return reply.code(400).send({ error: 'The port range start must not exceed its end.' })
      }
      const config = await portalStore.saveConfig(patch)
      broadcastPortal({ type: 'overview', payload: buildOverview() })
      return toConfigView(config)
    }
  )

  // ---- Cloudflare DNS automation ----

  app.post<{ Body: { apiToken: string } }>(
    '/api/cloudflare/connect',
    { preHandler: requireOperator },
    async (request, reply) => {
      if (isCloudflareManaged()) {
        return reply.code(409).send({
          error: 'Cloudflare credentials are set by CHUNKFORGE_CLOUDFLARE_API_TOKEN on this deployment.'
        })
      }
      const apiToken = request.body?.apiToken?.trim()
      if (!apiToken) return reply.code(400).send({ error: 'An API token is required.' })
      try {
        await connectCloudflare(apiToken)
        await syncWildcardRecord()
        const config = toConfigView(portalStore.config())
        broadcastPortal({ type: 'overview', payload: buildOverview() })
        return config
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post('/api/cloudflare/disconnect', { preHandler: requireOperator }, async (_request, reply) => {
    if (isCloudflareManaged()) {
      return reply.code(409).send({
        error: 'Cloudflare credentials are set by CHUNKFORGE_CLOUDFLARE_API_TOKEN on this deployment.'
      })
    }
    await disconnectCloudflare()
    const config = toConfigView(portalStore.config())
    broadcastPortal({ type: 'overview', payload: buildOverview() })
    return config
  })

  app.post('/api/cloudflare/test', { preHandler: requireOperator }, async (_request, reply) => {
    try {
      return await testCloudflareConnection()
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  /** Re-publishes the wildcard record on demand — useful after changing the zone or the public URL. */
  app.post('/api/cloudflare/sync-wildcard', { preHandler: requireOperator }, async (_request, reply) => {
    try {
      await syncWildcardRecord()
      return { ok: true }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // ---- pairing pins ----

  app.get('/api/pins', { preHandler: requireOperator }, async () => {
    await portalStore.reapPins()
    return portalStore.pins()
  })

  app.post<{ Body: { kind: PairingKind; label?: string } }>(
    '/api/pins',
    { preHandler: requireOperator },
    async (request, reply) => {
      const kind = request.body?.kind
      if (kind !== 'node' && kind !== 'client') {
        return reply.code(400).send({ error: "Pin kind must be 'node' or 'client'." })
      }
      return portalStore.createPin(kind, request.body?.label?.trim() || undefined)
    }
  )

  app.delete<{ Params: { code: string } }>(
    '/api/pins/:code',
    { preHandler: requireOperator },
    async (request) => {
      await portalStore.removePin(request.params.code)
      return { ok: true }
    }
  )

  // ---- nodes ----

  app.get('/api/nodes', { preHandler: requireOperator }, async () =>
    portalStore.nodes().map((node) => toNodeView(node))
  )

  app.delete<{ Params: { id: string } }>(
    '/api/nodes/:id',
    { preHandler: requireOperator },
    async (request) => {
      await portalRelay.closeNodeTunnels(request.params.id)
      await portalStore.removeNode(request.params.id)
      broadcastPortal({ type: 'node-removed', payload: { id: request.params.id } })
      return { ok: true }
    }
  )

  // ---- control planes ----

  app.get('/api/clients', { preHandler: requireOperator }, async () =>
    portalStore.clients().map(({ tokenHash: _hash, ...rest }) => rest)
  )

  /**
   * Renames a control plane from Portal's own side.
   *
   * The name a control plane reports is a build-time constant — every desktop
   * install calls itself "Chunkforge Desktop" — so on a Portal with more than
   * one attached, the operator needs to be able to tell them apart here.
   */
  app.patch<{ Params: { id: string }; Body: { name?: string } }>(
    '/api/clients/:id',
    { preHandler: requireOperator },
    async (request, reply) => {
      const client = portalStore.findClient(request.params.id)
      if (!client) return reply.code(404).send({ error: 'Unknown control plane.' })
      const name = request.body?.name?.trim()
      if (!name) return reply.code(400).send({ error: 'Enter a name.' })
      client.name = name
      await portalStore.upsertClient(client)
      broadcastPortal({ type: 'overview', payload: buildOverview() })
      const { tokenHash: _hash, ...view } = client
      return view
    }
  )

  app.delete<{ Params: { id: string } }>(
    '/api/clients/:id',
    { preHandler: requireOperator },
    async (request) => {
      await portalStore.removeClient(request.params.id)
      broadcastPortal({ type: 'overview', payload: buildOverview() })
      return { ok: true }
    }
  )

  // ---- domains ----

  app.get('/api/domains', { preHandler: requireOperator }, async () => portalStore.domains())

  app.delete<{ Params: { hostname: string } }>(
    '/api/domains/:hostname',
    { preHandler: requireOperator },
    async (request) => {
      const domain = portalStore.findDomain(request.params.hostname)
      if (!domain) return { ok: true }
      // The operator override goes through the store directly: unlike a control
      // plane releasing its own name, an operator may remove anybody's.
      await portalStore.removeDomain(domain.hostname)
      const node = portalStore.findNode(domain.nodeId)
      if (node) {
        node.tunnels = node.tunnels.filter((tunnel) => tunnel.id !== `domain:${domain.hostname}`)
        await portalStore.upsertNode(node)
        if (portalRelay.isNodeConnected(node.id)) {
          await portalRelay.syncNodeTunnels(node.id, node.tunnels)
        }
      }
      broadcastPortal({ type: 'domain-removed', payload: { hostname: domain.hostname } })
      return { ok: true }
    }
  )

  // ---- live admin stream ----

  app.get('/api/events', { websocket: true }, (connection, request) => {
    const socket = asSocket(connection)
    const token = (request.query as { token?: string } | undefined)?.token
    const cookie = request.cookies?.[PORTAL_SESSION_COOKIE]
    // The handshake carries no Authorization header, so the admin stream takes
    // the session from the cookie, or from the query for non-browser callers.
    if (!request.portalUser && !(token && resolveSession(token)) && !(cookie && resolveSession(cookie))) {
      socket.close(1008, 'Sign in required')
      return
    }
    const unsubscribe = subscribePortalEvents((event) => socket.send(JSON.stringify(event)))
    socket.on('close', unsubscribe)
    socket.on('error', unsubscribe)
  })
}

function setSessionCookie(reply: { setCookie: (...args: any[]) => unknown }, token: string): void {
  reply.setCookie(PORTAL_SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60
  })
}

function asSocket(connection: unknown): {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  on: (event: string, listener: (...args: any[]) => void) => void
} {
  // @fastify/websocket changed shape across majors; accept either.
  return (
    connection && typeof connection === 'object' && 'socket' in connection
      ? (connection as { socket: unknown }).socket
      : connection
  ) as ReturnType<typeof asSocket>
}
