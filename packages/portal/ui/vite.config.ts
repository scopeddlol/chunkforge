import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Portal's admin UI is its own small bundle, built into `ui-dist` beside the
 * service that serves it. It shares nothing with the Chunkforge renderer —
 * that is the point of the split: Portal's web interface manages subdomains and
 * routes, and the Chunkforge UI manages servers.
 */
export default defineConfig({
  plugins: [react()],
  base: '/',
  root: __dirname,
  build: {
    outDir: resolve(__dirname, '../ui-dist'),
    emptyOutDir: true
  },
  server: {
    port: 5180,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', ws: true }
    }
  }
})
