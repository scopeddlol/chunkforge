import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// The workspace packages are consumed as TypeScript source rather than as build
// artefacts, so they must be bundled rather than externalized — Electron's Node
// cannot import a .ts file at runtime. Their npm dependencies (Fastify, sharp)
// stay external, since those ship real builds.
const CORE_SRC = resolve(__dirname, '../core/src')
const API_SRC = resolve(__dirname, '../api/src')
const WORKSPACE_PACKAGES = ['@chunkforge/core', '@chunkforge/api']

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: WORKSPACE_PACKAGES })],
    resolve: {
      alias: {
        '@chunkforge/core': CORE_SRC,
        '@chunkforge/api': API_SRC,
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
