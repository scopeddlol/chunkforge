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
    /**
     * The socket is handed over only once the service has actually answered.
     *
     * Hijacking up front is tempting — it is the moment the decision to proxy
     * is made — but it takes away the ability to reply at all, so a service
     * that is simply not running gives the browser a reset connection with no
     * explanation. Waiting for the first byte means the two outcomes stay
     * distinguishable: a real answer is streamed through untouched, and a
     * silent or refused upstream still gets a 502 that says so.
     */
    let handedOver = false
    let settled = false

    const upstream = connect({ host: '127.0.0.1', port })

    const fail = (message: string): void => {
      if (settled) return
      settled = true
      upstream.destroy()
      if (!handedOver && !reply.sent) {
        void reply.code(502).send({ error: `That service is not answering: ${message}` })
      }
      resolve()
    }

    upstream.on('connect', () => {
      const headers = Object.entries(request.headers)
        .filter(([name]) => !HOP_BY_HOP.has(name.toLowerCase()))
        .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join('\r\n')

      // Written by hand rather than with an HTTP client, because the reply is
      // streamed straight back: whatever the service sends — a tile, a
      // WebSocket upgrade, a long poll — is passed through untouched.
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers}\r\n\r\n`)
      /**
       * `end: false` matters more than it looks.
       *
       * A plain GET has no body, so an ordinary pipe would half-close the
       * tunnel the instant the request was written. The relay's listener does
       * not allow half-open sockets, so that FIN tears the whole connection
       * down — and the service's reply, already on its way back, arrives at a
       * socket nobody is holding. The symptom is a service that is plainly
       * running answering every request with a gateway error.
       */
      request.raw.pipe(upstream, { end: false })
    })

    // The browser gave up, or the reply finished. Either way the tunnel is
    // this request's alone and must not outlive it.
    reply.raw.on('close', () => upstream.destroy())

    upstream.once('data', (chunk: Buffer) => {
      if (settled) return
      handedOver = true
      // hijack() hands the socket over, so Fastify stops trying to write a
      // response of its own on top of what the service is sending.
      reply.hijack()
      const socket = reply.raw.socket ?? reply.raw
      socket.write(chunk)
      upstream.pipe(socket)
    })

    // A service that accepts the connection and then says nothing is as broken
    // as one that refuses it, and without this the browser would wait forever.
    upstream.setTimeout(30_000, () => fail('it did not respond in time'))
    upstream.on('error', (err: Error) => fail(err.message))
    upstream.on('close', () => {
      if (handedOver) {
        settled = true
        resolve()
        return
      }
      fail('the connection closed before it answered')
    })
  })
}
