import { LOCAL_NODE_ID, type Node, type PortalTunnelPort, type Project } from './models'

// The platform models live in their own module but are part of the same public
// surface, so callers keep importing everything from one place.
export * from './models'

export type ServerType = 'vanilla' | 'paper' | 'purpur' | 'spigot' | 'forge' | 'fabric' | 'neoforge'

export const serverTypeLabels: Record<ServerType, string> = {
  vanilla: 'Vanilla',
  paper: 'Paper',
  purpur: 'Purpur',
  spigot: 'Spigot',
  forge: 'Forge',
  fabric: 'Fabric',
  neoforge: 'NeoForge'
}

/** What kind of add-ons a server type accepts. Drives the browser and tabs. */
export type ServerCategory = 'vanilla' | 'plugins' | 'mods'

export const serverTypeCategory: Record<ServerType, ServerCategory> = {
  vanilla: 'vanilla',
  paper: 'plugins',
  purpur: 'plugins',
  spigot: 'plugins',
  forge: 'mods',
  fabric: 'mods',
  neoforge: 'mods'
}

export const serverCategoryLabels: Record<ServerCategory, string> = {
  vanilla: 'Vanilla',
  plugins: 'Plugins',
  mods: 'Mods'
}

export const pluginServerTypes: ServerType[] = ['paper', 'purpur', 'spigot']
export const modServerTypes: ServerType[] = ['forge', 'fabric', 'neoforge']

/** Where add-ons are installed for a given server type. */
export function addOnFolder(serverType: ServerType): string {
  return serverTypeCategory[serverType] === 'mods' ? 'mods' : 'plugins'
}

/** Placeholders substituted into launchArgs at spawn time. */
export const LAUNCH_TOKENS = {
  minRam: '{MIN_RAM}',
  maxRam: '{MAX_RAM}'
} as const

export type InstanceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'

export interface InstanceSummary {
  id: string
  name: string
  serverType: ServerType
  minecraftVersion: string
  status: InstanceStatus
  playersOnline: number
  /**
   * Names of the players currently connected. Derived from the live process, so
   * it is absent when a summary is read straight off disk.
   */
  onlinePlayers?: string[]
  maxPlayers: number
  ramAllocatedMb: number
  accentColor: string
  createdAt: string
  /** Custom thumbnail as a data: URL. Falls back to generated artwork when unset. */
  iconDataUrl?: string | null
  /** @deprecated Superseded by `projectId`; still written for older builds. */
  groupId?: string | null
  /** Owning project. Stamped by migration on records that predate projects. */
  projectId?: string
  /** Node this instance runs on. `local` until remote nodes are paired. */
  nodeId?: string
  /** Public portal hostname (e.g. server-1.play.example.com) when provisioned. */
  portalHostname?: string
}

export interface InstanceMetadata extends InstanceSummary {
  port: number
  /**
   * On-disk schema generation. Lets the migration recognise records it has
   * already touched instead of rewriting every file on every boot.
   */
  schemaVersion?: number
  javaPath: string | null
  /** Java major version this server requires, per the upstream project's own metadata. */
  javaMajor?: number
  /** Server-recommended JVM tuning flags (Paper publishes these). */
  jvmFlags?: string[]
  /**
   * Full java argument list, with {MIN_RAM}/{MAX_RAM} substituted at spawn.
   * Editable from the instance's Startup settings — Forge in particular needs
   * an @args-file launch rather than a plain -jar.
   */
  launchArgs?: string[]
  backupSchedule?: BackupSchedule
  /** FileHub folder created for this server's backups. */
  fileHubFolderId?: string | null
  minRamMb: number
  maxRamMb: number
  eulaAccepted: boolean
  path: string
  toggles: InstanceToggles
  exposedPorts?: PortalTunnelPort[]
}

export interface InstanceToggles {
  onlineMode: boolean
  pvp: boolean
  hardcore: boolean
  whitelist: boolean
  commandBlocksEnabled: boolean
  spawnProtection: number
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard'
  viewDistance: number
}

export const defaultToggles: InstanceToggles = {
  onlineMode: true,
  pvp: true,
  hardcore: false,
  whitelist: false,
  commandBlocksEnabled: false,
  spawnProtection: 16,
  difficulty: 'normal',
  viewDistance: 10
}

export interface CreateInstanceConfig {
  name: string
  serverType: ServerType
  minecraftVersion: string
  port: number
  minRamMb: number
  maxRamMb: number
  toggles: InstanceToggles
  accentColor: string
  /** Parent directory to create the server's folder in. Defaults to the Chunkforge Instances root when omitted. */
  installLocation: string | null
  /** Installs Geyser + Floodgate so Bedrock clients can join. */
  enableGeyser?: boolean
  groupId?: string | null
  /** Plugins queued in the wizard, installed once the server exists. */
  initialPlugins?: QueuedPlugin[]
  /** Modpack to install over the fresh server, replacing manual mod picking. */
  modpack?: SelectedModpack | null
  exposedPorts?: PortalTunnelPort[]
}

export interface QueuedPlugin {
  source: PluginSource
  projectId: string
  name: string
}

export interface SelectedModpack {
  source: PluginSource
  projectId: string
  name: string
  downloadUrl: string
  serverType: ServerType
  minecraftVersion: string
}

/**
 * @deprecated Being replaced by `Project`, which adds ownership and permission
 * scope. Kept as the on-disk name so existing settings files keep loading.
 */
export interface ServerGroup {
  id: string
  name: string
  color: string
}

export interface ModpackInstallProgress {
  stage: 'downloading' | 'installing' | 'done'
  message: string
  percent: number
}

export interface DashboardStats {
  cpuPercent: number
  cpuCores: number
  totalMemoryBytes: number
  usedMemoryBytes: number
  /** Sum of max heap across running servers. */
  allocatedMemoryBytes: number
  serverCount: number
  runningCount: number
  playersOnline: number
  backupCount: number
  backupBytes: number
  diskBytes: number
  uptimeSeconds: number
}

export interface VersionCatalogEntry {
  id: string
  label: string
  isRecommended: boolean
  releasedAt: string | null
}

export type CreateProgressStage =
  | 'preparing'
  | 'resolving-java'
  | 'downloading-java'
  | 'downloading-server'
  | 'accepting-eula'
  | 'first-boot'
  | 'done'
  | 'error'

export interface CreateProgressEvent {
  instanceId: string
  stage: CreateProgressStage
  message: string
  percent: number | null
}

export interface LogLineEvent {
  instanceId: string
  line: string
  stream: 'stdout' | 'stderr' | 'system'
  timestamp: number
}

export interface StatusChangedEvent {
  instanceId: string
  status: InstanceStatus
}

export interface PlayersChangedEvent {
  instanceId: string
  players: string[]
}

export interface ChatMessage {
  id: string
  kind: 'chat' | 'join' | 'leave' | 'death' | 'server'
  author: string | null
  text: string
  timestamp: number
}

export interface PlayerEntry {
  name: string
  uuid: string | null
  online: boolean
  op: boolean
  whitelisted: boolean
  banned: boolean
}

export interface FileEntry {
  name: string
  /** Path relative to the instance root, using forward slashes. */
  relativePath: string
  isDirectory: boolean
  sizeBytes: number
  modifiedAt: number
  /** Whether the file is small enough and looks like text we can edit in-app. */
  editable: boolean
}

export interface BackupEntry {
  filename: string
  sizeBytes: number
  createdAt: number
}

export interface BackupSchedule {
  enabled: boolean
  intervalHours: number
  /** Oldest backups beyond this count are pruned. 0 keeps everything. */
  keepCount: number
  uploadToFileHub: boolean
  lastRunAt?: number
}

export const defaultBackupSchedule: BackupSchedule = {
  enabled: false,
  intervalHours: 6,
  keepCount: 5,
  uploadToFileHub: false
}

export type PluginSource = 'modrinth' | 'hangar' | 'spiget' | 'curseforge'

export const pluginSourceLabels: Record<PluginSource, string> = {
  modrinth: 'Modrinth',
  hangar: 'Hangar',
  spiget: 'SpigotMC',
  curseforge: 'CurseForge'
}

export interface PluginAlternative {
  source: PluginSource
  id: string
  downloads: number
  sourceUrl: string
}

export interface PluginSearchResult {
  source: PluginSource
  id: string
  name: string
  summary: string
  iconUrl: string | null
  downloads: number
  author: string
  sourceUrl: string
  categories: string[]
  /** Same project found on other sources; picked from at download time. */
  alternatives?: PluginAlternative[]
}

export interface PluginVersion {
  id: string
  name: string
  versionNumber: string
  gameVersions: string[]
  loaders: string[]
  /** Null when the source only links out (e.g. Hangar entries hosted on GitHub). */
  downloadUrl: string | null
  externalUrl: string | null
  filename: string | null
  sha1: string | null
}

export interface InstalledPlugin {
  filename: string
  sizeBytes: number
  enabled: boolean
}

export interface PluginSearchQuery {
  query: string
  sources: PluginSource[]
  gameVersion?: string
  loader?: string
  limit?: number
  /** Defaults to true; set false to see one card per source. */
  mergeSources?: boolean
}

export interface PluginSearchResponse {
  results: PluginSearchResult[]
  /** Per-source failures, so one dead source doesn't hide the rest. */
  errors: { source: PluginSource; message: string }[]
}

export type DashboardView = 'grid' | 'table'

export type ThemeId =
  | 'oled'
  | 'midnight'
  | 'nebula'
  | 'forest'
  | 'ember'
  | 'slate'
  | 'light'
  | 'parchment'

/** 'system' follows Windows and picks OLED Violet or Light accordingly. */
export type ThemePreference = 'system' | ThemeId

export interface FileHubSettings {
  /** Base URL of a self-hosted FileHub instance, e.g. https://files.example.com */
  baseUrl: string
  username: string
  /** Session cookie captured at sign-in; the password is never stored. */
  sessionCookie: string | null
  /** Destination folder id on FileHub, or null for the root. */
  folderId: string | null
  uploadBackupsAutomatically: boolean
}

export interface PortalSettings {
  enabled: boolean
  publicBaseUrl: string
  relayBaseUrl: string
  defaultDomainSuffix: string
  trustProxy: boolean
  autoProvisionSubdomains: boolean
  desktopConnectorPin: string
  connectionStatus: 'disconnected' | 'connecting' | 'connected'
  connectedAt?: string
}

export interface AppSettings {
  themePreference: ThemePreference
  curseForgeApiKey: string
  defaultInstallLocation: string | null
  defaultMinRamMb: number
  defaultMaxRamMb: number
  defaultPort: number
  enabledPluginSources: PluginSource[]
  confirmBeforeStop: boolean
  consoleScrollbackLines: number
  fileHub: FileHubSettings
  portal: PortalSettings
  /** @deprecated Migrated into `projects`; retained so older builds still read. */
  serverGroups: ServerGroup[]
  projects: Project[]
  /** Known hosts. Always contains the local node; remote ones are added by pairing. */
  nodes: Node[]
  dashboardView: DashboardView
}

export const defaultAppSettings: AppSettings = {
  themePreference: 'system',
  curseForgeApiKey: '',
  defaultInstallLocation: null,
  defaultMinRamMb: 2048,
  defaultMaxRamMb: 4096,
  defaultPort: 25565,
  enabledPluginSources: ['modrinth', 'hangar', 'spiget', 'curseforge'],
  confirmBeforeStop: true,
  consoleScrollbackLines: 2000,
  serverGroups: [],
  projects: [],
  nodes: [{ id: LOCAL_NODE_ID, name: 'This machine', kind: 'local', status: 'online' }],
  dashboardView: 'grid',
  portal: {
    enabled: false,
    publicBaseUrl: '',
    relayBaseUrl: '',
    defaultDomainSuffix: '',
    trustProxy: true,
    autoProvisionSubdomains: true,
    desktopConnectorPin: '',
    connectionStatus: 'disconnected'
  },
  fileHub: {
    baseUrl: '',
    username: '',
    sessionCookie: null,
    folderId: null,
    uploadBackupsAutomatically: false
  }
}

export interface FileHubStatus {
  configured: boolean
  connected: boolean
  username: string | null
  message: string | null
}

export interface BackupUploadProgress {
  instanceId: string
  filename: string
  percent: number
  done: boolean
  error: string | null
}
