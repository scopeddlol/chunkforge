import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import { configureDataRoot, ensureChunkforgeDirs, loadSettings, runMigrations } from '@chunkforge/core'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { authStore } from './auth/store'
import { registerAuth } from './auth/plugin'
import { registerAuthRoutes } from './routes/auth'
import { registerServerRoutes } from './routes/servers'
import { registerAddonRoutes } from './routes/addons'
import { registerInstanceToolRoutes } from './routes/instanceTools'
import { registerPlatformRoutes } from './routes/platform'
import { registerFileHubRoutes } from './routes/filehub'
import { attachCoreEvents, registerEventSocket } from './events'
import { registerCors } from './cors'
import { registerNodeForwarding } from './nodeForwarding'

export interface CoreApiOptions {
  /** Where instances, runtimes, and settings live. */
  dataRoot: string
  /** Omit to let the OS choose (embedded mode picks an ephemeral port). */
  port?: number
  host?: string
  logger?: boolean
  /**
   * Desktop mode. The API still enforces auth on every route, but the shell
   * owns the machine already, so it gets a ready-made owner session rather than
   * asking someone to invent a password to talk to their own computer.
   */
  localOwner?: boolean
  /**
   * Origins permitted to call this API cross-origin. Empty (the default) means
   * same-origin only, which is what a Docker panel serving its own UI wants.
   */
  allowedOrigins?: string[]
  /**
   * Serve the Chunkforge web UI from this API. Chunkforge Web turns this on and
   * points `uiRoot` at its built bundle; the desktop shell leaves it off,
   * because Electron loads the renderer itself.
   */
  serveWebUi?: boolean
  /** Directory holding the built Chunkforge UI. Required with `serveWebUi`. */
  uiRoot?: string
}

export interface RunningCoreApi {
  app: FastifyInstance
  url: string
  port: number
  /** Present only under `localOwner`; the shell hands this to its renderer. */
  sessionToken?: string
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
  // Runs before any route is served so handlers never see a half-migrated
  // record. It is a no-op once an install is current.
  await runMigrations()
  await authStore.load()

  const app = Fastify({
    logger: options.logger ?? false,
    // Behind a reverse proxy these are needed for correct client IPs and scheme.
    trustProxy: true
  })

  // Several actions — start, stop, logout, create-backup — take no body, but a
  // caller that sets a JSON content-type anyway is being reasonable, and
  // Fastify rejects that by default. Treating an empty body as absent keeps
  // curl, mobile clients, and automation from hitting a baffling 400.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const raw = typeof body === 'string' ? body.trim() : body
    if (!raw || raw.length === 0) {
      done(null, undefined)
      return
    }
    try {
      done(null, JSON.parse(raw as string))
    } catch {
      const err = Object.assign(new Error('Invalid JSON body'), { statusCode: 400 })
      done(err, undefined)
    }
  })

  await app.register(cookie)
  await app.register(websocket)

  const uiRoot =
    options.uiRoot ?? join(dirname(fileURLToPath(import.meta.url)), '../../web/dist')
  const serveWebUi = (options.serveWebUi ?? false) && existsSync(uiRoot)
  if (serveWebUi) {
    await app.register(fastifyStatic, {
      root: uiRoot,
      wildcard: false,
      // We serve '/' ourselves for SPA fallback; leaving static index enabled
      // registers another GET '/' and crashes startup with duplicated route.
      index: false
    })
  }

  // Must precede the auth hook so a rejected preflight never reaches it.
  registerCors(app, options.allowedOrigins ?? [])

  await registerAuth(app)
  await registerAuthRoutes(app)
  // Must precede the server routes: a request for a server that lives on a node
  // is answered by that node, and never reaches the handlers below.
  await registerNodeForwarding(app)
  await registerServerRoutes(app)
  await registerAddonRoutes(app)
  await registerInstanceToolRoutes(app)
  await registerPlatformRoutes(app)
  await registerFileHubRoutes(app)
  await registerEventSocket(app)

  attachCoreEvents()

  app.get('/api/health', async () => ({ ok: true, version: '0.5.1' }))

  if (serveWebUi) {
    app.get('/', async (_request, reply) => reply.sendFile('index.html'))
    app.get<{ Params: { '*': string } }>('/*', async (request, reply) => {
      const path = String(request.params['*'] ?? '')
      if (path.startsWith('api/')) return reply.code(404).send({ error: 'Not found' })
      return reply.sendFile('index.html')
    })
  }

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
    sessionToken: options.localOwner ? await createLocalOwnerSession() : undefined,
    close: async () => {
      await app.close()
    }
  }
}

/**
 * Returns a session for the desktop shell's own owner account, creating that
 * account on first run. The password is random and discarded — this account is
 * reached through the shell, never a login form.
 */
async function createLocalOwnerSession(): Promise<string> {
  const existing = authStore.findByUsername(LOCAL_OWNER_USERNAME)
  const user =
    existing ??
    (await authStore.createUser(LOCAL_OWNER_USERNAME, randomBytes(32).toString('hex'), 'owner'))
  return authStore.createSession(user.id, 'Chunkforge Desktop').token
}

const LOCAL_OWNER_USERNAME = 'local'

export { authStore } from './auth/store'
export * from './auth/model'
export { ChunkforgeClient, ApiError, type ClientOptions } from './client'
export type { ServerEvent, ServerEventType, ServerEventPayloads } from './eventTypes'
export {
  connectToPortal,
  disconnectFromPortal,
  refreshPortalStatus,
  listAllNodes,
  claimPortalNode,
  releasePortalNode,
  provisionInstanceDomain,
  releaseInstanceDomain,
  listPortalDomains,
  callNodeAgent
} from './portalLink'
