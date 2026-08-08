import type { NodeApi } from './index'

declare global {
  interface Window {
    chunkforgeNode: NodeApi
  }
}

export {}
