import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { hashToken, newToken, requireClient } from '../auth'
import { allocateDomain, listDomainsForClient, releaseDomain } from '../domains'
import { dnsRecordsFor, portalPublicHost, wildcardRecord } from '../dns'
import { broadcastPortal } from '../events'
import { portalRelay } from '../relay'
import { portalStore } from '../store'
import { buildOverview, toNodeView } from '../views'
import type { ClientKind, PortalClientRecord, TunnelProtocol } from '../types'

/**
 * The control-plane-facing surface: what Chunkforge Desktop and Chunkforge Web
 * call.
 *
 * Two things happen here. A control plane asks for **names** — subdomains for
 * the servers it creates — and it asks to **reach nodes**, which it does by
 * having Portal forward Core API calls down a node's socket. That second part
 * is what lets one UI on your desk deploy to a machine 500 miles away without
 * that machine exposing anything.
 */
export async function registerClientRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { pin: string; name?: string; kind?: ClientKind } }>(
    '/api/client/redeem',
    async (request, reply) => {
      try {
        const pin = await portalStore.redeemPin(request.body?.pin ?? '', 'client')
        const token = newToken()
        const client: PortalClientRecord = {
          id: randomUUID(),
          name: request.body?.name?.trim() || pin.label || 'Chunkforge',
          kind: request.body?.kind === 'web' ? 'web' : 'desktop',
          tokenHash: hashToken(token),
          pairedAt: new Date().toISOString()
        }
        await portalStore.upsertClient(client)
        broadcastPortal({ type: 'overview', payload: buildOverview() })
        return {
          clientId: client.id,
          clientToken: token,
          zoneSuffix: portalStore.config().zoneSuffix,
          publicBaseUrl: portalStore.config().publicBaseUrl
        }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  /** Lets a control plane confirm its token is still good and see the zone. */
  app.get('/api/client/status', { preHandler: requireClient }, async (request) => {
    const client = portalStore.findClient(request.portalClientId!)!
    client.lastSeenAt = new Date().toISOString()
    await portalStore.upsertClient(client)
    const config = portalStore.config()
    return {
      clientId: client.id,
      name: client.name,
      kind: client.kind,
      zoneSuffix: config.zoneSuffix,
      publicBaseUrl: config.publicBaseUrl,
      autoAllocatePorts: config.autoAllocatePorts,
      wildcardRecord: wildcardRecord(portalPublicHost())
    }
  })

  // ---- nodes ----

  app.get('/api/client/nodes', { preHandler: requireClient }, async (request) =>
    portalStore.nodes().map((node) => toNodeView(node, request.portalClientId))
  )

  /**
   * Adopting a node is what moves it from "Portal can see it" to "this UI
   * manages it". Portal keeps the claim so two control planes attached to the
   * same Portal cannot both drive one machine.
   */
  app.post<{ Params: { id: string } }>(
    '/api/client/nodes/:id/claim',
    { preHandler: requireClient },
    async (request, reply) => {
      const node = portalStore.findNode(request.params.id)
      if (!node) return reply.code(404).send({ error: 'Unknown node.' })
      if (node.claimedByClientId && node.claimedByClientId !== request.portalClientId) {
        return reply.code(409).send({ error: 'That node is already claimed by another control plane.' })
      }
      node.claimedByClientId = request.portalClientId
      await portalStore.upsertNode(node)
      const view = toNodeView(node, request.portalClientId)
      broadcastPortal({ type: 'node-updated', payload: view })
      return view
    }
  )

  app.post<{ Params: { id: string } }>(
    '/api/client/nodes/:id/release',
    { preHandler: requireClient },
    async (request, reply) => {
      const node = portalStore.findNode(request.params.id)
      if (!node) return reply.code(404).send({ error: 'Unknown node.' })
      if (node.claimedByClientId !== request.portalClientId) {
        return reply.code(403).send({ error: 'That node is not claimed by you.' })
      }
      delete node.claimedByClientId
      await portalStore.upsertNode(node)
      return toNodeView(node, request.portalClientId)
    }
  )

  /**
   * The control channel. Any Chunkforge Core API call the UI would make locally
   * can be made against a remote node by prefixing it with this route; Portal
   * forwards it verbatim down the node's socket and returns what came back.
   */
  app.all<{ Params: { id: string; '*': string } }>(
    '/api/client/nodes/:id/agent/*',
    { preHandler: requireClient },
    async (request, reply) => {
      const node = portalStore.findNode(request.params.id)
      if (!node) return reply.code(404).send({ error: 'Unknown node.' })
      if (node.claimedByClientId !== request.portalClientId) {
        return reply.code(403).send({ error: 'Claim this node before managing it.' })
      }

      const suffix = String(request.params['*'] ?? '')
      const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''
      const body =
        request.body === undefined || request.body === null
          ? undefined
          : Buffer.from(
              typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
            ).toString('base64')

      try {
        const response = await portalRelay.callAgent(node.id, {
          method: request.method,
          path: `/${suffix}${query}`,
          // Only content negotiation is forwarded. The caller's Portal
          // credentials must not leak onto the node, which authenticates the
          // agent link on its own terms.
          headers: {
            'content-type': String(request.headers['content-type'] ?? 'application/json'),
            accept: String(request.headers.accept ?? 'application/json')
          },
          body
        })
        if (response.error) return reply.code(502).send({ error: response.error })
        void reply.code(response.status)
        for (const [key, value] of Object.entries(response.headers ?? {})) {
          if (key.toLowerCase() === 'content-length') continue
          void reply.header(key, value)
        }
        return response.body ? reply.send(Buffer.from(response.body, 'base64')) : reply.send()
      } catch (err) {
        return reply.code(502).send({ error: (err as Error).message })
      }
    }
  )

  // ---- domains ----

  app.get('/api/client/domains', { preHandler: requireClient }, async (request) => {
    const host = portalPublicHost()
    return listDomainsForClient(request.portalClientId!).map((domain) => ({
      ...domain,
      dnsRecords: dnsRecordsFor(domain, host)
    }))
  })

  /**
   * Allocate a subdomain for a server. Chunkforge calls this every time a
   * server is created, which is what makes "every server gets an address"
   * automatic rather than a thing you remember to do.
   */
  app.post<{
    Body: {
      nodeId: string
      name?: string
      label?: string
      instanceId?: string
      protocol?: TunnelProtocol
      targetPort: number
      publicPort?: number
    }
  }>('/api/client/domains', { preHandler: requireClient }, async (request, reply) => {
    try {
      const domain = await allocateDomain({
        clientId: request.portalClientId!,
        nodeId: request.body.nodeId,
        name: request.body.name,
        label: request.body.label,
        instanceId: request.body.instanceId,
        protocol: request.body.protocol,
        targetPort: request.body.targetPort,
        publicPort: request.body.publicPort
      })
      broadcastPortal({ type: 'domain-updated', payload: domain })
      broadcastPortal({ type: 'overview', payload: buildOverview() })
      return { ...domain, dnsRecords: dnsRecordsFor(domain, portalPublicHost()) }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete<{ Params: { hostname: string } }>(
    '/api/client/domains/:hostname',
    { preHandler: requireClient },
    async (request, reply) => {
      try {
        await releaseDomain(request.params.hostname, request.portalClientId!)
        broadcastPortal({ type: 'domain-removed', payload: { hostname: request.params.hostname } })
        return { ok: true }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )
}
