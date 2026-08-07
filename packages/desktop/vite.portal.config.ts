import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const CORE_SRC = resolve(__dirname, '../core/src')
const API_SRC = resolve(__dirname, '../api/src')

export default defineConfig({
  plugins: [react()],
  base: '/',
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, '../api/portal-dist'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared/types': resolve(CORE_SRC, 'types/index.ts'),
      '@chunkforge/core': resolve(CORE_SRC, 'types/index.ts'),
      '@chunkforge/api/client': resolve(API_SRC, 'client.ts')
    }
  }
})
