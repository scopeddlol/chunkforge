import type { ChunkforgeApi } from './index'

declare global {
  interface Window {
    chunkforge: ChunkforgeApi
  }
}
