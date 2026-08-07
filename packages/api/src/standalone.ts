import { homedir } from 'os'
import { join } from 'path'
import { startCoreApi } from './index'

/**
 * Standalone entrypoint for the Docker panel and for local development.
 * The desktop app does not use this — it embeds createCoreApi directly.
 */
const dataRoot = process.env.CHUNKFORGE_DATA ?? join(homedir(), 'Chunkforge')
const port = Number(process.env.PORT ?? 8080)
// Containers must bind all interfaces to be reachable from outside.
const host = process.env.HOST ?? '0.0.0.0'

const running = await startCoreApi({ dataRoot, port, host, logger: true })
console.log(`Chunkforge Core API listening on ${running.url}`)
console.log(`Data root: ${dataRoot}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void running.close().then(() => process.exit(0))
  })
}
