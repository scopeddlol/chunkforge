import { spawn, type ChildProcess } from 'child_process'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { startCoreApi } from '@chunkforge/api'

/**
 * Chunkforge Web.
 *
 * The full Chunkforge interface, served over HTTP instead of loaded by
 * Electron, with the Core API behind it. This is what you run in a homelab when
 * you want the panel reachable from any machine in the house rather than tied
 * to one desktop.
 *
 * It is a *control plane*, the same as Chunkforge Desktop: it manages servers,
 * and it attaches to a Portal to get subdomains and to reach nodes. It is not a
 * Portal, and it does not proxy player traffic.
 */
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')

const dataRoot = process.env.CHUNKFORGE_DATA ?? '/data'
const port = Number(process.env.PORT ?? 8080)
const host = process.env.HOST ?? '0.0.0.0'
const uiRoot = process.env.CHUNKFORGE_UI_ROOT ?? resolve(here, '../dist')
const allowedOrigins = (process.env.CHUNKFORGE_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const running = await startCoreApi({
  dataRoot: join(dataRoot, 'panel'),
  port,
  host,
  logger: true,
  allowedOrigins,
  serveWebUi: true,
  uiRoot
})

console.log(`Chunkforge Web listening on ${running.url}`)
console.log(`UI served from ${uiRoot}`)
console.log(`Data root: ${dataRoot}`)

/**
 * The packaged node, run as a genuinely separate process.
 *
 * Optional on purpose. A homelab box that both hosts the panel and runs the
 * servers wants this on, and gets one container instead of two. A panel that
 * only ever deploys to machines elsewhere leaves it off and stays small.
 *
 * It cannot run in-process alongside the panel. @chunkforge/core's data root,
 * settings cache, and instance manager are all process-wide singletons —
 * correct for every other host, which only ever runs one Core API per
 * process, but two Core APIs sharing one process means the second
 * `configureDataRoot()` call silently overwrites the first's. The panel would
 * end up reading and writing the node's own settings.json instead of its
 * own — including which remote servers it knows about, which is exactly the
 * kind of thing that turns into "Unknown instance" the moment anyone tries to
 * act on a server the panel created moments earlier. A child process gets the
 * node the same total isolation Desktop, the standalone API, and a bare node
 * container already have by only ever running one Core API each.
 */
let node: ChildProcess | null = null
if (isTruthy(process.env.CHUNKFORGE_EMBEDDED_NODE)) {
  try {
    node = spawn('npm', ['run', 'start', '--workspace', '@chunkforge/node-worker'], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        CHUNKFORGE_PORTAL_URL: required('CHUNKFORGE_PORTAL_URL'),
        CHUNKFORGE_PAIRING_PIN: required('CHUNKFORGE_PAIRING_PIN'),
        CHUNKFORGE_NODE_NAME: process.env.CHUNKFORGE_NODE_NAME?.trim() || 'Chunkforge Web (local node)',
        CHUNKFORGE_DATA: join(dataRoot, 'node'),
        CHUNKFORGE_HEARTBEAT_MS: process.env.CHUNKFORGE_HEARTBEAT_MS ?? '15000'
      }
    })
    node.on('exit', (code, signal) => {
      // Losing the node is not fatal to the panel — it can still manage
      // servers on other nodes — but a silent restart loop would be worse
      // than a log line explaining why this container's own node vanished.
      if (!shuttingDown) {
        console.error(`Embedded node exited (code=${code ?? '-'}, signal=${signal ?? '-'})`)
      }
      node = null
    })
  } catch (err) {
    console.error(`Embedded node did not start: ${(err as Error).message}`)
  }
}

let shuttingDown = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shuttingDown = true
    node?.kill(signal)
    void running.close().then(() => process.exit(0))
  })
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required when CHUNKFORGE_EMBEDDED_NODE is on.`)
  return value
}
