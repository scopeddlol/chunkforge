import { startPortal } from './index'

/**
 * Container entrypoint for Chunkforge Portal.
 *
 * This is the piece that lives on a VPS. It wants a public address, a DNS zone
 * it can hand subdomains out of, and a port range it is allowed to bind — the
 * machines running Minecraft are somewhere else entirely.
 */
const dataRoot = process.env.CHUNKFORGE_PORTAL_DATA ?? '/data'
const port = Number(process.env.PORT ?? 8080)
const host = process.env.HOST ?? '0.0.0.0'

const running = await startPortal({ dataRoot, port, host, logger: true })

console.log(`Chunkforge Portal listening on ${running.url}`)
console.log(`Data root: ${dataRoot}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void running.close().then(() => process.exit(0))
  })
}
