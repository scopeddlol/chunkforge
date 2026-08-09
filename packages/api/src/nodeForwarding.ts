import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { guardNodeAccess } from './auth/nodeAccess'
import { callNodeAgent } from './portalLink'
import { nodeForInstance } from './remoteInstances'

/**
 * Transparent forwarding for servers that live on a Portal node.
 *
 * Chunkforge has roughly forty routes shaped `/api/servers/:id/...` — console,
 * files, backups, add-ons, players. Teaching each one to check where its server
 * lives would be forty chances to forget, and the fortieth would be found by a
 * user whose file browser silently listed the wrong machine's disk.
 *
 * So the check happens once, here. If the id in the path belongs to a remote
 * server, the entire request is handed to that node's own Core API and its
 * answer is returned verbatim. Every route downstream can then be written as if
 * every server were local, because as far as it can tell, every server is.
 */
export async function registerNodeForwarding(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const instanceId = instanceIdFromPath(request.url)
    if (!instanceId) return
    // Deleting a remote server is the one call with work on both sides: the
    // node destroys the files, and this control plane has to release the
    // subdomain and drop its pointer. Its handler forwards deliberately.
    if (request.method === 'DELETE' && isBareInstancePath(request.url)) return
    // Who may use a server is a question about *accounts*, and accounts live
    // here. A node has no such route and no idea who anyone is, so this must
    // never travel.
    if (isAccessPath(request.url)) return
    // A port change has work on both sides: the node rewrites
    // server.properties, and this control plane has to re-point the Portal
    // route and its DNS at the new port. Its handler forwards deliberately.
    if (request.method === 'PATCH' && isBareInstancePath(request.url) && changesPort(request.body)) return
    // Modpack installation needs something only this control plane holds — the
    // CurseForge key — added to the body before it travels. Its handler
    // forwards by hand for that reason.
    if (request.method === 'POST' && isModpackPath(request.url)) return
    // Endpoints are allocated on two machines at once — a local port by the
    // node, a public one by Portal — so `routes/endpoints.ts` splits the call
    // itself and forwards only the half the node owns.
    if (isEndpointPath(request.url)) return

    const nodeId = nodeForInstance(instanceId)
    if (!nodeId) return

    // The same single point that decides *where* a request goes is the right
    // place to decide whether the caller may go there. Forty routes forwarding
    // through here means forty routes that cannot forget this check.
    //
    // This hook runs *before* each route's own `requireRole`, so it has to
    // answer the signed-out case itself — otherwise a request with no session
    // would be forwarded to the node before anything had asked who was making
    // it. Nobody signed in is 401, not 403: what they need is to sign in.
    if (!request.user && !request.nodeId) {
      return reply.code(401).send({ error: 'Sign in required' })
    }
    if (!(await guardNodeAccess(request, reply, nodeId))) return

    const suffix = request.url.slice(request.url.indexOf('/api/servers'))
    try {
      const response = await callNodeAgent(
        nodeId,
        request.method,
        suffix,
        request.body === undefined || request.body === null ? undefined : request.body
      )
      const payload = Buffer.from(await response.arrayBuffer())
      void reply.code(response.status)
      const contentType = response.headers.get('content-type')
      if (contentType) void reply.header('content-type', contentType)
      return reply.send(payload)
    } catch (err) {
      // The node is unreachable, not the request malformed — 502 says which.
      return reply.code(502).send({ error: (err as Error).message })
    }
  })
}

/**
 * Pulls the instance id out of a `/api/servers/<id>` path, ignoring the query
 * string. Returns null for the collection route, which is aggregated rather
 * than forwarded.
 */
function instanceIdFromPath(url: string): string | null {
  const path = url.split('?')[0]
  const match = /^\/api\/servers\/([^/]+)/.exec(path)
  return match ? decodeURIComponent(match[1]) : null
}

/** True for `/api/servers/<id>` with nothing after it. */
function isBareInstancePath(url: string): boolean {
  return /^\/api\/servers\/[^/]+$/.test(url.split('?')[0])
}

/** True for `/api/servers/<id>/access`. */
function isAccessPath(url: string): boolean {
  return /^\/api\/servers\/[^/]+\/access$/.test(url.split('?')[0])
}

/** True when a PATCH body actually sets a port. */
function changesPort(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && 'port' in (body as Record<string, unknown>))
}

/** True for `/api/servers/<id>/endpoints` and anything under it. */
function isEndpointPath(url: string): boolean {
  return /^\/api\/servers\/[^/]+\/endpoints(\/|$)/.test(url.split('?')[0])
}

/** True for `/api/servers/<id>/modpack`. */
function isModpackPath(url: string): boolean {
  return /^\/api\/servers\/[^/]+\/modpack$/.test(url.split('?')[0])
}
