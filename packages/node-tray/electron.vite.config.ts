import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Workspace packages are consumed as TypeScript source, so they must be bundled
// rather than externalized — Electron's Node cannot import a .ts file at
// runtime. Their npm dependencies ship real builds and stay external.
const CORE_SRC = resolve(__dirname, '../core/src')
const API_SRC = resolve(__dirname, '../api/src')
const PORTAL_SRC = resolve(__dirname, '../portal/src')
const NODE_WORKER_SRC = resolve(__dirname, '../node-worker/src')
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
        '@chunkforge/node-worker': resolve(NODE_WORKER_SRC, 'index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })]
  },
  renderer: {
    resolve: {
      alias: { '@renderer': resolve('src/renderer/src') }
    },
    plugins: [react()]
  }
})
