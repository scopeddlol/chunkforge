import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// The workspace packages are consumed as TypeScript source rather than as build
// artefacts, so they must be bundled rather than externalized — Electron's Node
// cannot import a .ts file at runtime. Their npm dependencies (Fastify, sharp)
// stay external, since those ship real builds.
const CORE_SRC = resolve(__dirname, '../core/src')
const API_SRC = resolve(__dirname, '../api/src')
const PORTAL_SRC = resolve(__dirname, '../portal/src')
const NODE_WORKER_SRC = resolve(__dirname, '../node-worker/src')
// Every workspace package the Core API can reach transitively has to be
// listed here, not just the ones desktop imports directly — the exclude list
// controls what gets inlined vs. left as a real runtime import, and
// @chunkforge/api now pulls in @chunkforge/portal (for the Portal link and
// its event relay). Missing one here doesn't fail the build; it fails
// silently at launch, because Electron's Node has no loader for the raw .ts
// source a skipped package's "exports" field points at.
const WORKSPACE_PACKAGES = [
  '@chunkforge/core',
  '@chunkforge/api',
  '@chunkforge/portal',
  '@chunkforge/node-worker'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    resolve: {
      alias: {
        '@chunkforge/core': CORE_SRC,
        '@chunkforge/api': API_SRC,
        '@chunkforge/portal/client': resolve(PORTAL_SRC, 'client.ts'),
        '@chunkforge/portal/protocol': resolve(PORTAL_SRC, 'protocol.ts'),
        '@chunkforge/portal/types': resolve(PORTAL_SRC, 'types.ts'),
        '@chunkforge/portal/domains': resolve(PORTAL_SRC, 'domains.ts'),
        '@chunkforge/portal': resolve(PORTAL_SRC, 'index.ts'),
        '@chunkforge/node-worker': resolve(NODE_WORKER_SRC, 'index.ts'),
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    resolve: {
      alias: {
        '@chunkforge/core': CORE_SRC
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        // The renderer only ever imports types and plain data constants from
        // core, so pointing straight at the types module keeps Node-only code
        // out of the browser bundle.
        '@shared/types': resolve(CORE_SRC, 'types/index.ts'),
        '@chunkforge/core': resolve(CORE_SRC, 'types/index.ts'),
        // Only the client is pulled in — it is transport code with type-only
        // imports, so none of the Fastify server surface reaches the browser.
        '@chunkforge/api/client': resolve(API_SRC, 'client.ts')
      }
    },
    plugins: [react()]
  }
})
