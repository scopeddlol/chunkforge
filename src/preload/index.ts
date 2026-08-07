import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateInstanceConfig,
  CreateProgressEvent,
  InstanceMetadata,
  InstanceSummary,
  InstanceToggles,
  LogLineEvent,
  ServerType,
  StatusChangedEvent,
  VersionCatalogEntry
} from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_: unknown, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return (): void => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const windowControls = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  onMaximizedChanged: (callback: (maximized: boolean) => void): (() => void) =>
    subscribe('window:maximized-changed', callback)
}

const theme = {
  getSystemTheme: (): Promise<'light' | 'dark'> => ipcRenderer.invoke('theme:get'),
  onSystemThemeChanged: (callback: (theme: 'light' | 'dark') => void): (() => void) =>
    subscribe('theme:system-changed', callback)
}

const servers = {
  list: (): Promise<InstanceSummary[]> => ipcRenderer.invoke('servers:list'),
  getMetadata: (id: string): Promise<InstanceMetadata> => ipcRenderer.invoke('servers:getMetadata', id),
  create: (config: CreateInstanceConfig): Promise<InstanceMetadata> =>
    ipcRenderer.invoke('servers:create', config),
  start: (id: string): Promise<void> => ipcRenderer.invoke('servers:start', id),
  stop: (id: string): Promise<void> => ipcRenderer.invoke('servers:stop', id),
  sendCommand: (id: string, command: string): Promise<void> =>
    ipcRenderer.invoke('servers:sendCommand', id, command),
  listVersions: (serverType: ServerType): Promise<VersionCatalogEntry[]> =>
    ipcRenderer.invoke('servers:listVersions', serverType),
  updateToggles: (id: string, toggles: InstanceToggles): Promise<InstanceMetadata> =>
    ipcRenderer.invoke('servers:updateToggles', id, toggles),
  onLog: (callback: (event: LogLineEvent) => void): (() => void) => subscribe('servers:log', callback),
  onStatusChanged: (callback: (event: StatusChangedEvent) => void): (() => void) =>
    subscribe('servers:status-changed', callback),
  onCreateProgress: (callback: (event: CreateProgressEvent) => void): (() => void) =>
    subscribe('servers:create-progress', callback),
  getDefaultInstancesRoot: (): Promise<string> => ipcRenderer.invoke('servers:getDefaultInstancesRoot'),
  pickInstallLocation: (): Promise<string | null> => ipcRenderer.invoke('servers:pickInstallLocation')
}

const chunkforgeApi = {
  window: windowControls,
  theme,
  servers
}

export type ChunkforgeApi = typeof chunkforgeApi

contextBridge.exposeInMainWorld('chunkforge', chunkforgeApi)
