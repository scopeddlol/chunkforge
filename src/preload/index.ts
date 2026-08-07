import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CreateInstanceConfig,
  CreateProgressEvent,
  InstalledPlugin,
  InstanceMetadata,
  InstanceSummary,
  InstanceToggles,
  LogLineEvent,
  PluginSearchQuery,
  PluginSearchResponse,
  PluginSource,
  PluginVersion,
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
  pickInstallLocation: (): Promise<string | null> => ipcRenderer.invoke('servers:pickInstallLocation'),
  openFolder: (id: string): Promise<void> => ipcRenderer.invoke('servers:openFolder', id),
  delete: (id: string, deleteFiles: boolean): Promise<void> =>
    ipcRenderer.invoke('servers:delete', id, deleteFiles),
  updateSettings: (id: string, patch: Partial<InstanceMetadata>): Promise<InstanceMetadata> =>
    ipcRenderer.invoke('servers:updateSettings', id, patch)
}

const plugins = {
  search: (query: PluginSearchQuery): Promise<PluginSearchResponse> =>
    ipcRenderer.invoke('plugins:search', query),
  availableSources: (): Promise<PluginSource[]> => ipcRenderer.invoke('plugins:availableSources'),
  listVersions: (source: PluginSource, projectId: string): Promise<PluginVersion[]> =>
    ipcRenderer.invoke('plugins:listVersions', source, projectId),
  listInstalled: (instanceId: string): Promise<InstalledPlugin[]> =>
    ipcRenderer.invoke('plugins:listInstalled', instanceId),
  install: (instanceId: string, version: PluginVersion, fallbackName: string): Promise<string> =>
    ipcRenderer.invoke('plugins:install', instanceId, version, fallbackName),
  setEnabled: (instanceId: string, filename: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('plugins:setEnabled', instanceId, filename, enabled),
  uninstall: (instanceId: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('plugins:uninstall', instanceId, filename),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('plugins:openExternal', url)
}

const settings = {
  get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  update: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:update', patch),
  detectJava: (): Promise<Array<{ path: string; majorVersion: number }>> =>
    ipcRenderer.invoke('settings:detectJava'),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('settings:openDataFolder'),
  pickFolder: (title: string): Promise<string | null> => ipcRenderer.invoke('settings:pickFolder', title)
}

const chunkforgeApi = {
  window: windowControls,
  theme,
  servers,
  plugins,
  settings
}

export type ChunkforgeApi = typeof chunkforgeApi

contextBridge.exposeInMainWorld('chunkforge', chunkforgeApi)
