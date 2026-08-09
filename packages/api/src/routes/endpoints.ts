import type { FastifyInstance } from 'fastify'
import {
  addEndpoint,
  endpointsFor,
  extraEndpoints,
  GAME_ENDPOINT_ID,
  loadInstanceMetadata,
  saveInstanceMetadata,
  type AddEndpointRequest,
  type EndpointProtocol,
  type ServerEndpoint
} from '@chunkforge/core'
import { guardNodeAccess } from '../auth/nodeAccess'
import { requireRole } from '../auth/plugin'
import { broadcast } from '../events'
import { localNodeId, redeclareLocalEndpoints } from '../localNode'
import {
  callNodeAgent,
  listEndpointMappings,
  publishEndpoint,
  unpublishEndpoint
} from '../portalLink'
import { nodeForInstance } from '../remoteInstances'

/**
 * A server's network endpoints, and their public mappings.
 *
 * Every operation here has work on two machines, which is why these routes are
 * excluded from the transparent forwarding the rest of `/api/servers/:id/...`
 * gets. A local port can only be allocated by the machine that will listen on
 * it — it is the only party that can tell whether a port is actually free —
 * while a public port can only be allocated by Portal, which the node has no
 * credentials for. So the node-side half travels to the node as
 * `/api/servers/:id/local-endpoints`, and the Portal-side half stays here.
 */

/** What a caller sees: the node's endpoint, plus how the world reaches it. */
export interface EndpointView extends ServerEndpoint {
  /** Present once Portal has published it. */
  mappingId?: string
  publicHostname?: string
  published: boolean
}

/**
 * Node-access enforcement for the routes that skip the forwarding hook.
 *
 * Everything else under `/api/servers/:id/...` is checked inside
 * `registerNodeForwarding`, which these routes deliberately bypass. Bypassing
 * the forwarding must not also bypass the check — a user restricted to one
 * node could otherwise open a port on a machine they were never granted, by
 * asking about a server that lives there.
 */
async function guardInstanceNode(
  request: { params: unknown } & Parameters<typeof guardNodeAccess>[0],
  reply: Parameters<typeof guardNodeAccess>[1]
): Promise<unknown> {
  const params = request.params as { id?: string }
  if (!params?.id) return undefined
  const allowed = await guardNodeAccess(request, reply, nodeForInstance(params.id))
  // Returning the reply is how an async hook tells Fastify the request is
  // already answered; without it the handler would still run after the 403.
  return allowed ? undefined : reply
}

export async function registerEndpointRoutes(app: FastifyInstance): Promise<void> {
  // ---- node-side half ----
  //
  // Reached directly on a local install, and over the agent link on a node.
  // Deliberately knows nothing about Portal: a node has no client token, and
  // giving it one so it could publish its own ports would undo the reason
  // endpoint registration exists.

  app.get<{ Params: { id: string } }>(
    '/api/servers/:id/local-endpoints',
    { preHandler: requireRole('viewer') },
    async (request, reply) => {
      try {
        return endpointsFor(await loadInstanceMetadata(request.params.id))
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{ Params: { id: string }; Body: AddEndpointRequest }>(
    '/api/servers/:id/local-endpoints',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        const endpoint = await addEndpoint(metadata, {
          label: request.body.label,
          protocol: request.body.protocol,
          localPort: request.body.localPort,
          source: request.body.source ?? 'custom'
        })
        await saveInstanceMetadata({
          ...metadata,
          endpoints: [...extraEndpoints(metadata), endpoint]
        })
        broadcast({ type: 'endpoints-changed', payload: { instanceId: request.params.id } })
        return endpoint
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.delete<{ Params: { id: string; endpointId: string } }>(
    '/api/servers/:id/local-endpoints/:endpointId',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      // The game port is derived from `metadata.port`, not stored, so there is
      // nothing here to delete and no server without one.
      if (request.params.endpointId === GAME_ENDPOINT_ID) {
        return reply.code(400).send({ error: "A server's own game port cannot be removed." })
      }
      try {
        const metadata = await loadInstanceMetadata(request.params.id)
        await saveInstanceMetadata({
          ...metadata,
          endpoints: extraEndpoints(metadata).filter(
            (endpoint) => endpoint.id !== request.params.endpointId
          )
        })
        broadcast({ type: 'endpoints-changed', payload: { instanceId: request.params.id } })
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  // ---- control-plane half ----

  app.get<{ Params: { id: string } }>(
    '/api/servers/:id/endpoints',
    { preHandler: [requireRole('viewer'), guardInstanceNode] },
    async (request, reply) => {
      try {
        const endpoints = await localEndpoints(app, request.params.id)
        return await withMappings(request.params.id, endpoints)
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message })
      }
    }
  )

  app.post<{
    Params: { id: string }
    Body: { label: string; protocol: EndpointProtocol; localPort?: number; publish?: boolean }
  }>(
    '/api/servers/:id/endpoints',
    { preHandler: [requireRole('member'), guardInstanceNode] },
    async (request, reply) => {
      try {
        const created = await createLocalEndpoint(app, request.params.id, request.body)
        // Publishing is best-effort: the port is open on the node whether or
        // not Portal could map it, and reporting the whole thing as failed
        // would leave a listening service the UI claims does not exist.
        const published =
          request.body.publish === false ? null : await tryPublish(request.params.id, created)
        return { ...created, ...published, published: Boolean(published) }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /** Publishes an endpoint that already exists — an add-on's, typically. */
  app.post<{ Params: { id: string; endpointId: string } }>(
    '/api/servers/:id/endpoints/:endpointId/publish',
    { preHandler: [requireRole('member'), guardInstanceNode] },
    async (request, reply) => {
      try {
        const endpoints = await localEndpoints(app, request.params.id)
        const endpoint = endpoints.find((entry) => entry.id === request.params.endpointId)
        if (!endpoint) return reply.code(404).send({ error: 'No such endpoint.' })

        const nodeId = nodeForEndpoint(request.params.id)
        if (!nodeId) {
          return reply.code(400).send({
            error: 'This server is not on a node Portal can reach, so its ports cannot be published.'
          })
        }
        const mapping = await publishWithRetry(request.params.id, nodeId, endpoint)
        if (!mapping) return reply.code(400).send({ error: 'Connect this Chunkforge to a Portal first.' })
        return { ...endpoint, ...describeMapping(mapping), published: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /** Takes the public mapping away but leaves the port open on the node. */
  app.delete<{ Params: { id: string; endpointId: string } }>(
    '/api/servers/:id/endpoints/:endpointId/publish',
    { preHandler: [requireRole('member'), guardInstanceNode] },
    async (request) => {
      await unpublishEndpoint(request.params.id, request.params.endpointId)
      return { ok: true }
    }
  )

  app.delete<{ Params: { id: string; endpointId: string } }>(
    '/api/servers/:id/endpoints/:endpointId',
    { preHandler: [requireRole('member'), guardInstanceNode] },
    async (request, reply) => {
      if (request.params.endpointId === GAME_ENDPOINT_ID) {
        return reply.code(400).send({ error: "A server's own game port cannot be removed." })
      }
      try {
        // Public mapping first: the reverse order can leave Portal relaying to
        // a port nothing is listening on, which looks to a player like the
        // service is broken rather than gone.
        await unpublishEndpoint(request.params.id, request.params.endpointId)
        await deleteLocalEndpoint(app, request.params.id, request.params.endpointId)
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )
}

/**
 * The node an endpoint would be published on.
 *
 * A remote server's node is the one holding it. A local server's is this
 * machine — but only if it has registered itself with Portal, because without
 * that registration there is no relay socket to carry the traffic and nothing
 * to allocate against.
 */
function nodeForEndpoint(instanceId: string): string | null {
  return nodeForInstance(instanceId) ?? localNodeId()
}

async function localEndpoints(app: FastifyInstance, instanceId: string): Promise<ServerEndpoint[]> {
  const nodeId = nodeForInstance(instanceId)
  if (!nodeId) return endpointsFor(await loadInstanceMetadata(instanceId))
  return agentJson<ServerEndpoint[]>(
    app,
    nodeId,
    'GET',
    `/api/servers/${encodeURIComponent(instanceId)}/local-endpoints`
  )
}

async function createLocalEndpoint(
  app: FastifyInstance,
  instanceId: string,
  body: AddEndpointRequest
): Promise<ServerEndpoint> {
  const nodeId = nodeForInstance(instanceId)
  if (!nodeId) {
    const metadata = await loadInstanceMetadata(instanceId)
    const endpoint = await addEndpoint(metadata, body)
    await saveInstanceMetadata({ ...metadata, endpoints: [...extraEndpoints(metadata), endpoint] })
    broadcast({ type: 'endpoints-changed', payload: { instanceId } })
    await redeclareLocalEndpoints()
    return endpoint
  }
  return agentJson<ServerEndpoint>(
    app,
    nodeId,
    'POST',
    `/api/servers/${encodeURIComponent(instanceId)}/local-endpoints`,
    body
  )
}

async function deleteLocalEndpoint(
  app: FastifyInstance,
  instanceId: string,
  endpointId: string
): Promise<void> {
  const nodeId = nodeForInstance(instanceId)
  if (!nodeId) {
    const metadata = await loadInstanceMetadata(instanceId)
    await saveInstanceMetadata({
      ...metadata,
      endpoints: extraEndpoints(metadata).filter((endpoint) => endpoint.id !== endpointId)
    })
    broadcast({ type: 'endpoints-changed', payload: { instanceId } })
    await redeclareLocalEndpoints()
    return
  }
  await agentJson<{ ok: true }>(
    app,
    nodeId,
    'DELETE',
    `/api/servers/${encodeURIComponent(instanceId)}/local-endpoints/${encodeURIComponent(endpointId)}`
  )
}

async function agentJson<T>(
  app: FastifyInstance,
  nodeId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await callNodeAgent(nodeId, method, path, body)
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error ?? `The node returned HTTP ${response.status}`)
  app.log.debug({ nodeId, path }, 'endpoint call forwarded to node')
  return payload
}

/**
 * Publishes, waiting for the node to catch up.
 *
 * Portal refuses to publish a port its node has not registered — the check
 * that makes endpoints safe. A port created a moment ago is in exactly that
 * state until the node re-declares, which it does as soon as it sees the
 * change but not instantaneously. So a refusal that names an unregistered
 * endpoint is retried briefly rather than reported: the alternative is a
 * "Publish" button that fails for a second after every "Add".
 */
async function publishWithRetry(
  instanceId: string,
  nodeId: string,
  endpoint: ServerEndpoint
): Promise<Awaited<ReturnType<typeof publishEndpoint>>> {
  let last: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await publishEndpoint({ instanceId, nodeId, endpoint })
    } catch (err) {
      last = err
      if (!/has not registered/.test((err as Error).message)) throw err
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
  }
  throw last as Error
}

/** Publishes without letting a Portal problem fail the caller's request. */
async function tryPublish(
  instanceId: string,
  endpoint: ServerEndpoint
): Promise<Partial<EndpointView> | null> {
  const nodeId = nodeForEndpoint(instanceId)
  if (!nodeId) return null
  try {
    const mapping = await publishWithRetry(instanceId, nodeId, endpoint)
    return mapping ? describeMapping(mapping) : null
  } catch {
    return null
  }
}

function describeMapping(mapping: {
  id: string
  publicPort: number
  hostname?: string
}): Partial<EndpointView> {
  return {
    mappingId: mapping.id,
    publicPort: mapping.publicPort,
    publicHostname: mapping.hostname
  }
}

/**
 * Joins the node's endpoints to Portal's mappings.
 *
 * Portal is the authority on the public half and the node on the local half,
 * so neither list is derived from the other — they are matched on the
 * `<instanceId>:<endpointId>` name both sides already agree on.
 */
async function withMappings(instanceId: string, endpoints: ServerEndpoint[]): Promise<EndpointView[]> {
  const mappings = await listEndpointMappings()
  return endpoints.map((endpoint) => {
    const mapping = mappings.find(
      (entry) => entry.endpointId === `${instanceId}:${endpoint.id}`
    )
    return {
      ...endpoint,
      ...(mapping ? describeMapping(mapping) : {}),
      published: Boolean(mapping)
    }
  })
}
