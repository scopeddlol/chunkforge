interface NativeApi {
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

function unsupported(name: string): never {
  throw new Error(`${name} is only available in the desktop app.`)
}

const browserNative: NativeApi = {
  apiUrl: async () => null,
  apiToken: async () => null,
  window: {
    minimize: async () => unsupported('Window controls'),
    maximizeToggle: async () => unsupported('Window controls'),
    close: async () => unsupported('Window controls'),
    isMaximized: async () => false,
    onMaximizedChanged: () => () => undefined
  },
  theme: {
    getSystemTheme: async () =>
      window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    onSystemThemeChanged: (callback) => {
      const media = window.matchMedia('(prefers-color-scheme: light)')
      const listener = (event: MediaQueryListEvent): void => callback(event.matches ? 'light' : 'dark')
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    }
  },
  openExternal: async (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  openFolder: async () => unsupported('Opening folders'),
  openDataFolder: async () => unsupported('Opening the data folder'),
  pickFolder: async () => unsupported('Folder selection'),
  getDefaultInstancesRoot: async () => '',
  getIcon: async () => unsupported('Reading server icons'),
  pickIcon: async () => unsupported('Choosing server icons'),
  clearIcon: async () => unsupported('Clearing server icons')
}

export function native(): NativeApi {
  return window.native ?? browserNative
}

/**
 * Whether this renderer is inside Electron rather than a browser tab.
 *
 * The two hosts share every screen, but a handful of them have to describe the
 * machine differently — "this computer" against "this container" — and only
 * the desktop build can open a folder picker. Asking the bridge is the honest
 * test; user agents are not.
 */
export function isDesktopHost(): boolean {
  return Boolean(window.native)
}
