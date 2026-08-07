import { startNodeFromEnvironment } from './index'

/** Container entrypoint for a standalone Chunkforge Node. */
const running = await startNodeFromEnvironment()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void running.close().then(() => process.exit(0))
  })
}
