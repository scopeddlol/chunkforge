import { contextBridge, ipcRenderer } from 'electron'

const windowControls = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChanged: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_: unknown, maximized: boolean): void => callback(maximized)
    ipcRenderer.on('window:maximized-changed', listener)
    return (): void => {
      ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  }
}

const theme = {
  getSystemTheme: (): Promise<'light' | 'dark'> => ipcRenderer.invoke('theme:get'),
  onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void): (() => void) => {
    const listener = (_: unknown, value: 'light' | 'dark'): void => callback(value)
    ipcRenderer.on('theme:system-changed', listener)
    return (): void => {
      ipcRenderer.removeListener('theme:system-changed', listener)
    }
  }
}

const chunkforgeApi = {
  window: windowControls,
  theme
}

export type ChunkforgeApi = typeof chunkforgeApi

contextBridge.exposeInMainWorld('chunkforge', chunkforgeApi)
