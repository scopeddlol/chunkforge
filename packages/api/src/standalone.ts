import { homedir } from 'os'
import { join } from 'path'
import { startCoreApi } from './index'

/**
 * Headless Core API, for development and for anything that wants Chunkforge's
 * API without a UI in front of it.
 *
 * Chunkforge Web does not use this — it has its own entrypoint, which also
 * serves the UI and can bring up a co-located node. See `@chunkforge/web`.
 */
const dataRoot = process.env.CHUNKFORGE_DATA ?? join(homedir(), 'Chunkforge')
const port = Number(process.env.PORT ?? 8080)
// Containers must bind all interfaces to be reachable from outside.
const host = process.env.HOST ?? '0.0.0.0'
const allowedOrigins = (process.env.CHUNKFORGE_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const running = await startCoreApi({ dataRoot, port, host, logger: true, allowedOrigins })
console.log(`Chunkforge Core API listening on ${running.url}`)
console.log(`Data root: ${dataRoot}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void running.close().then(() => process.exit(0))
  })
}
