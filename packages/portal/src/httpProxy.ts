import { connect } from 'net'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { findHttpEndpointByHostname } from './endpoints'

/**
 * Serving HTTP endpoints by hostname.
 *
 * A map or a web console reached on a numbered port is a URL nobody can
 * remember and half of corporate networks will not let through. So HTTP
 * endpoints get a subdomain and are served on Portal's ordinary web port,
 * routed by the Host header.
 *
 * Underneath it is the same relay as everything else: the endpoint already has
 * a TCP tunnel bound on a Portal-local port, and this simply forwards to it.
 * Reusing the relay rather than inventing an HTTP-specific frame keeps exactly
 * one code path carrying bytes between Portal and a node — the part that has
 * to be right — and means an HTTP endpoint gets the node's inbound-port-free
 * guarantee for free.
 */

/** Hop-by-hop headers, which describe one connection and must not be relayed. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

export async function registerHttpProxy(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Portal's own API and admin UI always win; only unknown hostnames are
    // candidates for proxying, so adding an endpoint can never shadow a route
    // an operator needs to reach Portal itself.
    if (request.url.startsWith('/api/')) return

    const host = request.headers.host
    if (!host) return
    const mapping = findHttpEndpointByHostname(host)
    if (!mapping) return

    await proxy(request, reply, mapping.publicPort)
  })
}

function proxy(request: FastifyRequest, reply: FastifyReply, port: number): Promise<void> {
  return new Promise((resolve) => {
    const upstream = connect({ host: '127.0.0.1', port }, () => {
      const headers = Object.entries(request.headers)
        .filter(([name]) => !HOP_BY_HOP.has(name.toLowerCase()))
        .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join('\r\n')

      // Written by hand rather than with an HTTP client, because the reply is
      // streamed straight back: whatever the service sends — a tile, a
      // WebSocket upgrade, a long poll — is passed through untouched.
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers}\r\n\r\n`)
      request.raw.pipe(upstream)
    })

    upstream.on('error', (err: Error) => {
      if (!reply.sent) {
        void reply.code(502).send({ error: `That service is not answering: ${err.message}` })
      }
      resolve()
    })

    // hijack() hands the socket over, so Fastify stops trying to write a
    // response of its own on top of what the service is sending.
    reply.hijack()
    upstream.pipe(reply.raw.socket ?? reply.raw)
    upstream.on('close', () => resolve())
  })
}
