declare global {
  interface Window {
    /** Native-only bridge; all domain data goes through the Core API client. */
    native?: ChunkforgeNativeApi
  }
}
