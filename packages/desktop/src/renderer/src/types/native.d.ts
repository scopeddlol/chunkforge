interface ChunkforgeNativeApi {
  apiUrl: () => Promise<string | null>
  apiToken: () => Promise<string | null>
  window: {
    minimize: () => Promise<void>
    maximizeToggle: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizedChanged: (callback: (maximized: boolean) => void) => (() => void)
  }
  theme: {
    getSystemTheme: () => Promise<'light' | 'dark'>
    onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void) => (() => void)
  }
  openExternal: (url: string) => Promise<void>
  openFolder: (instanceId: string) => Promise<void>
  openDataFolder: () => Promise<void>
  pickFolder: (title: string) => Promise<string | null>
  getDefaultInstancesRoot: () => Promise<string>
  getIcon: (instanceId: string) => Promise<string | null>
  pickIcon: (instanceId: string) => Promise<string | null>
  clearIcon: (instanceId: string) => Promise<void>
}

declare global {
  interface Window {
    native?: ChunkforgeNativeApi
  }
}

export {}
