import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import { configureDataRoot, ensureChunkforgeDirs, loadSettings } from '@chunkforge/core'
import { authStore } from './auth/store'
import { registerAuth } from './auth/plugin'
import { registerAuthRoutes } from './routes/auth'
import { registerServerRoutes } from './routes/servers'
import { registerAddonRoutes } from './routes/addons'
import { registerInstanceToolRoutes } from './routes/instanceTools'
import { registerPlatformRoutes } from './routes/platform'
import { registerFileHubRoutes } from './routes/filehub'
import { attachCoreEvents, registerEventSocket } from './events'

export interface CoreApiOptions {
  /** Where instances, runtimes, and settings live. */
  dataRoot: string
  /** Omit to let the OS choose (embedded mode picks an ephemeral port). */
  port?: number
  host?: string
  logger?: boolean
}

export interface RunningCoreApi {
  app: FastifyInstance
  url: string
  port: number
  close: () => Promise<void>
}

/**
 * Builds the Core API. The desktop shell embeds this in-process; the Docker
 * panel and node agents run the same thing standalone. Nothing here knows
 * about Electron.
 */
export async function createCoreApi(options: CoreApiOptions): Promise<FastifyInstance> {
  configureDataRoot(options.dataRoot)
  await ensureChunkforgeDirs()
  await loadSettings()
  await authStore.load()

  const app = Fastify({
    logger: options.logger ?? false,
    // Behind a reverse proxy these are needed for correct client IPs and scheme.
    trustProxy: true
  })

  await app.register(cookie)
  await app.register(websocket)

  await registerAuth(app)
  await registerAuthRoutes(app)
  await registerServerRoutes(app)
  await registerAddonRoutes(app)
  await registerInstanceToolRoutes(app)
  await registerPlatformRoutes(app)
  await registerFileHubRoutes(app)
  await registerEventSocket(app)

  attachCoreEvents()

  app.get('/api/health', async () => ({ ok: true, version: '0.3.0' }))

  return app
}

export async function startCoreApi(options: CoreApiOptions): Promise<RunningCoreApi> {
  const app = await createCoreApi(options)
  // Port 0 asks the OS for a free port, which is what embedded mode wants so it
  // never collides with something already listening.
  const port = options.port ?? 0
  const host = options.host ?? '127.0.0.1'

  await app.listen({ port, host })

  const address = app.server.address()
  const boundPort = typeof address === 'object' && address ? address.port : port

  return {
    app,
    port: boundPort,
    url: `http://${host}:${boundPort}`,
    close: () => app.close()
  }
}

export { authStore } from './auth/store'
export * from './auth/model'
export { ChunkforgeClient, ApiError, type ClientOptions } from './client'
export type { ServerEvent } from './events'
