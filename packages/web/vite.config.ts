import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const RENDERER = resolve(__dirname, '../desktop/src/renderer')
const CORE_SRC = resolve(__dirname, '../core/src')
const API_SRC = resolve(__dirname, '../api/src')

/**
 * Chunkforge Web builds the **same renderer** the desktop app ships.
 *
 * That is the point of this package: Web is not a reduced web version of
 * Chunkforge, it is Chunkforge, served over HTTP instead of loaded by Electron.
 * The renderer already talks to the Core API over HTTP with a typed client and
 * holds no privileged bridge, so nothing about it needs to change to run in a
 * browser — only where it is served from.
 */
export default defineConfig({
  plugins: [react()],
  base: '/',
  root: RENDERER,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@renderer': resolve(RENDERER, 'src'),
      // The browser bundle gets the *types* module, not core itself — core
      // spawns processes and touches disk, and must never reach a browser.
      '@shared/types': resolve(CORE_SRC, 'types/index.ts'),
      '@chunkforge/core': resolve(CORE_SRC, 'types/index.ts'),
      '@chunkforge/api/client': resolve(API_SRC, 'client.ts')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', ws: true }
    }
  }
})
