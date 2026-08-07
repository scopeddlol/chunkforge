import { contextBridge, ipcRenderer } from 'electron'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_: unknown, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return (): void => {
    ipcRenderer.removeListener(channel, listener)
  }
}

/**
 * After the Core API extraction this bridge carries only what a browser can't
 * do: window chrome, OS dialogs, the shell, and the system theme. Everything
 * else the renderer needs goes over HTTP to the embedded API, which is what
 * lets the same UI run on the web.
 */
const nativeApi = {
  /** Base URL of the embedded Core API this window should talk to. */
  apiUrl: (): Promise<string | null> => ipcRenderer.invoke('native:apiUrl'),

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChanged: (callback: (maximized: boolean) => void): (() => void) =>
      subscribe('window:maximized-changed', callback)
  },

  theme: {
    getSystemTheme: (): Promise<'light' | 'dark'> => ipcRenderer.invoke('theme:get'),
    onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void): (() => void) =>
      subscribe('theme:system-changed', callback)
  },

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('native:openExternal', url),
  openFolder: (instanceId: string): Promise<void> => ipcRenderer.invoke('native:openFolder', instanceId),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('native:openDataFolder'),
  pickFolder: (title: string): Promise<string | null> => ipcRenderer.invoke('native:pickFolder', title),
  getDefaultInstancesRoot: (): Promise<string> => ipcRenderer.invoke('native:getDefaultInstancesRoot'),

  getIcon: (instanceId: string): Promise<string | null> => ipcRenderer.invoke('native:getIcon', instanceId),
  pickIcon: (instanceId: string): Promise<string | null> => ipcRenderer.invoke('native:pickIcon', instanceId),
  clearIcon: (instanceId: string): Promise<void> => ipcRenderer.invoke('native:clearIcon', instanceId)
}

export type NativeApi = typeof nativeApi

contextBridge.exposeInMainWorld('native', nativeApi)
