import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import { registerPortalAuth } from './auth'
import { applyEnvironmentConfig } from './environment'
import { portalRelay } from './relay'
import { portalStore } from './store'
import { registerHttpProxy } from './httpProxy'
import { registerAdminRoutes } from './routes/admin'
import { registerClientRoutes } from './routes/clients'
import { registerNodeRoutes } from './routes/nodes'
import { PORTAL_VERSION } from './views'

export interface PortalOptions {
  /** Where portal.json lives. A container mounts a volume here. */
  dataRoot: string
  port?: number
  host?: string
  logger?: boolean
  /** Serve the bundled admin UI. Off in development, where Vite serves it. */
  serveAdminUi?: boolean
}

export interface RunningPortal {
  app: FastifyInstance
  url: string
  port: number
  close: () => Promise<void>
}

/**
 * Builds Chunkforge Portal.
 *
 * Portal is a subdomain manager and proxy, and nothing else. It has no
 * `@chunkforge/core` dependency on purpose: it cannot start a Minecraft server
 * even if asked, because it holds none of the code that could. That constraint
 * is the architecture — a Portal on a small VPS stays small, while the machines
 * that actually run servers stay wherever they are, behind whatever NAT they
 * happen to sit behind.
 */
export async function createPortal(options: PortalOptions): Promise<FastifyInstance> {
  await portalStore.load(options.dataRoot)
  // Before any route is served, so a redeployed container never answers with a
  // base URL it has since moved away from.
  await applyEnvironmentConfig()

  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: portalStore.config().trustProxy
  })

  // Several POSTs take no body but arrive with a JSON content-type anyway;
  // Fastify rejects that by default and the resulting 400 is baffling.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const raw = typeof body === 'string' ? body.trim() : body
    if (!raw || raw.length === 0) {
      done(null, undefined)
      return
    }
    try {
      done(null, JSON.parse(raw as string))
    } catch {
      done(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }), undefined)
    }
  })

  await app.register(cookie)
  await app.register(websocket)

  const uiRoot = join(dirname(fileURLToPath(import.meta.url)), '../ui-dist')
  const serveUi = (options.serveAdminUi ?? true) && existsSync(uiRoot)
  if (serveUi) {
    await app.register(fastifyStatic, {
      root: uiRoot,
      wildcard: false,
      // '/' is served below for SPA fallback; letting static claim it too
      // registers a duplicate route and crashes startup.
      index: false
    })
  }

  await registerPortalAuth(app)
  // Ahead of the routes: an unknown hostname belonging to an HTTP endpoint is
  // proxied, and everything else falls through to Portal's own surfaces.
  await registerHttpProxy(app)
  await registerAdminRoutes(app)
  await registerNodeRoutes(app)
  await registerClientRoutes(app)

  app.get('/api/health', async () => ({ ok: true, service: 'chunkforge-portal', version: PORTAL_VERSION }))

  if (serveUi) {
    app.get('/', async (_request, reply) => reply.sendFile('index.html'))
    app.get<{ Params: { '*': string } }>('/*', async (request, reply) => {
      if (String(request.params['*'] ?? '').startsWith('api/')) {
        return reply.code(404).send({ error: 'Not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}

export async function startPortal(options: PortalOptions): Promise<RunningPortal> {
  const app = await createPortal(options)
  const port = options.port ?? 8080
  const host = options.host ?? '0.0.0.0'
  await app.listen({ port, host })

  const address = app.server.address()
  const boundPort = typeof address === 'object' && address ? address.port : port

  return {
    app,
    port: boundPort,
    url: `http://${host}:${boundPort}`,
    close: async () => {
      await portalRelay.close()
      await app.close()
    }
  }
}

export { portalStore } from './store'
export { portalRelay } from './relay'
export { PortalClient, PortalApiError } from './client'
export * from './types'
export * from './protocol'
export type { DnsRecord } from './dns'
export { managedPublicBaseUrl, isPublicBaseUrlManaged } from './environment'
export type { PortalEvent, PortalEventType, PortalEventPayloads } from './events'
