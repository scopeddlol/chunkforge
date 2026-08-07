import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// @chunkforge/core is consumed as TypeScript source rather than a build artefact,
// so it must be bundled (not externalized) into the main process output.
const CORE_SRC = resolve(__dirname, '../core/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@chunkforge/core'] })],
    resolve: {
      alias: {
        '@chunkforge/core': CORE_SRC,
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@chunkforge/core'] })],
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
        '@chunkforge/core': resolve(CORE_SRC, 'types/index.ts')
      }
    },
    plugins: [react()]
  }
})
