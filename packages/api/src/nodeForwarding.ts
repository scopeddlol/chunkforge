import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
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

    const nodeId = nodeForInstance(instanceId)
    if (!nodeId) return

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
