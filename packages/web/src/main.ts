import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { startCoreApi } from '@chunkforge/api'
import { startNodeAgent, type RunningNodeAgent } from '@chunkforge/node-worker'

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
 * The packaged node.
 *
 * Optional on purpose. A homelab box that both hosts the panel and runs the
 * servers wants this on, and gets one container instead of two. A panel that
 * only ever deploys to machines elsewhere leaves it off and stays small.
 *
 * The node keeps its own data root, because it is a genuinely separate
 * Chunkforge install that happens to share a container — its servers belong to
 * it, not to the panel in front of it.
 */
let node: RunningNodeAgent | null = null
if (isTruthy(process.env.CHUNKFORGE_EMBEDDED_NODE)) {
  try {
    node = await startNodeAgent({
      portalUrl: required('CHUNKFORGE_PORTAL_URL'),
      pairingPin: required('CHUNKFORGE_PAIRING_PIN'),
      nodeName: process.env.CHUNKFORGE_NODE_NAME?.trim() || 'Chunkforge Web (local node)',
      dataRoot: join(dataRoot, 'node'),
      heartbeatIntervalMs: Number(process.env.CHUNKFORGE_HEARTBEAT_MS ?? 15000)
    })
    console.log(`Embedded Chunkforge Node started (${node.nodeId})`)
  } catch (err) {
    // The panel is useful without the co-located node — it can still manage
    // remote ones — so a bad pin must not take the whole container down.
    console.error(`Embedded node did not start: ${(err as Error).message}`)
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void Promise.allSettled([node?.close(), running.close()]).then(() => process.exit(0))
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
