import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  BackupEntry,
  BackupSchedule,
  BackupUploadProgress,
  CreateInstanceConfig,
  FileHubStatus,
  CreateProgressEvent,
  DashboardStats,
  FileEntry,
  InstalledPlugin,
  InstanceMetadata,
  InstanceSummary,
  InstanceToggles,
  LogLineEvent,
  PlayerEntry,
  PlayersChangedEvent,
  PluginSearchQuery,
  PluginSearchResponse,
  PluginSource,
  PluginVersion,
  ServerGroup,
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
    ipcRenderer.invoke('servers:updateSettings', id, patch),
  getIcon: (id: string): Promise<string | null> => ipcRenderer.invoke('servers:getIcon', id),
  pickIcon: (id: string): Promise<string | null> => ipcRenderer.invoke('servers:pickIcon', id),
  clearIcon: (id: string): Promise<void> => ipcRenderer.invoke('servers:clearIcon', id)
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

const players = {
  list: (instanceId: string): Promise<PlayerEntry[]> => ipcRenderer.invoke('players:list', instanceId),
  online: (instanceId: string): Promise<string[]> => ipcRenderer.invoke('players:online', instanceId),
  action: (instanceId: string, action: string, name: string, reason?: string): Promise<void> =>
    ipcRenderer.invoke('players:action', instanceId, action, name, reason),
  say: (instanceId: string, message: string): Promise<void> =>
    ipcRenderer.invoke('players:say', instanceId, message),
  onChanged: (callback: (event: PlayersChangedEvent) => void): (() => void) =>
    subscribe('players:changed', callback)
}

const files = {
  list: (instanceId: string, relativePath: string): Promise<FileEntry[]> =>
    ipcRenderer.invoke('files:list', instanceId, relativePath),
  read: (instanceId: string, relativePath: string): Promise<string> =>
    ipcRenderer.invoke('files:read', instanceId, relativePath),
  write: (instanceId: string, relativePath: string, contents: string): Promise<void> =>
    ipcRenderer.invoke('files:write', instanceId, relativePath, contents),
  delete: (instanceId: string, relativePath: string): Promise<void> =>
    ipcRenderer.invoke('files:delete', instanceId, relativePath),
  rename: (instanceId: string, relativePath: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('files:rename', instanceId, relativePath, newName),
  createFolder: (instanceId: string, relativePath: string): Promise<void> =>
    ipcRenderer.invoke('files:createFolder', instanceId, relativePath)
}

const backups = {
  list: (instanceId: string): Promise<BackupEntry[]> => ipcRenderer.invoke('backups:list', instanceId),
  create: (instanceId: string): Promise<BackupEntry> => ipcRenderer.invoke('backups:create', instanceId),
  restore: (instanceId: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('backups:restore', instanceId, filename),
  delete: (instanceId: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('backups:delete', instanceId, filename),
  getSchedule: (instanceId: string): Promise<BackupSchedule> =>
    ipcRenderer.invoke('backups:getSchedule', instanceId),
  setSchedule: (instanceId: string, schedule: BackupSchedule): Promise<BackupSchedule> =>
    ipcRenderer.invoke('backups:setSchedule', instanceId, schedule),
  onAutoCreated: (callback: (event: { instanceId: string; filename: string }) => void): (() => void) =>
    subscribe('backups:auto-created', callback)
}

const filehub = {
  status: (): Promise<FileHubStatus> => ipcRenderer.invoke('filehub:status'),
  login: (
    baseUrl: string,
    username: string,
    password: string,
    totp?: string
  ): Promise<{ ok: boolean; totpRequired: boolean; message: string | null }> =>
    ipcRenderer.invoke('filehub:login', baseUrl, username, password, totp),
  logout: (): Promise<void> => ipcRenderer.invoke('filehub:logout'),
  listFolders: (): Promise<Array<{ id: string; name: string }>> =>
    ipcRenderer.invoke('filehub:listFolders'),
  uploadBackup: (instanceId: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('filehub:uploadBackup', instanceId, filename),
  onUploadProgress: (callback: (event: BackupUploadProgress) => void): (() => void) =>
    subscribe('filehub:upload-progress', callback)
}

const stats = {
  dashboard: (): Promise<DashboardStats> => ipcRenderer.invoke('stats:dashboard')
}

const groups = {
  list: (): Promise<ServerGroup[]> => ipcRenderer.invoke('groups:list'),
  create: (name: string, color: string): Promise<ServerGroup> =>
    ipcRenderer.invoke('groups:create', name, color),
  rename: (id: string, name: string, color: string): Promise<ServerGroup[]> =>
    ipcRenderer.invoke('groups:rename', id, name, color),
  delete: (id: string): Promise<void> => ipcRenderer.invoke('groups:delete', id),
  assign: (instanceId: string, groupId: string | null): Promise<void> =>
    ipcRenderer.invoke('groups:assign', instanceId, groupId),
  bulk: (groupId: string, action: 'start' | 'stop'): Promise<{ total: number; failed: number }> =>
    ipcRenderer.invoke('groups:bulk', groupId, action)
}

const chunkforgeApi = {
  window: windowControls,
  stats,
  groups,
  theme,
  servers,
  plugins,
  settings,
  players,
  files,
  backups,
  filehub
}

export type ChunkforgeApi = typeof chunkforgeApi

contextBridge.exposeInMainWorld('chunkforge', chunkforgeApi)
