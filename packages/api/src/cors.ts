import type { FastifyInstance } from 'fastify'

/**
 * Cross-origin access for the API.
 *
 * The Docker panel serves its UI from the same origin and needs none of this.
 * The desktop shell does: its renderer is loaded from `file://` in production
 * and from the Vite dev server in development, while the embedded API listens
 * on a loopback port — three different origins. Without this the renderer
 * cannot call its own backend, and every request fails as an opaque network
 * error rather than anything diagnosable.
 *
 * The allowlist is explicit rather than a wildcard. A wildcard would let any
 * page the user happens to visit talk to their loopback API, and while every
 * route still demands a credential, that is a needless thing to leave open.
 */
export function registerCors(app: FastifyInstance, allowedOrigins: string[]): void {
  if (allowedOrigins.length === 0) return

  // A file:// document sends `Origin: null`, which is a legitimate value here
  // and distinct from the header being absent.
  const allowed = new Set(allowedOrigins)

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin
    if (!origin || !allowed.has(origin)) return

    reply.header('access-control-allow-origin', origin)
    reply.header('access-control-allow-credentials', 'true')
    reply.header('vary', 'origin')

    if (request.method === 'OPTIONS') {
      reply
        .header('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
        .header('access-control-allow-headers', 'content-type,authorization')
        .header('access-control-max-age', '86400')
        .code(204)
        .send()
    }
  })
}
