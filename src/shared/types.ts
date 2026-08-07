export type ServerType = 'vanilla' | 'paper' | 'purpur' | 'spigot' | 'forge' | 'fabric'

export type InstanceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'

export interface InstanceSummary {
  id: string
  name: string
  serverType: ServerType
  minecraftVersion: string
  status: InstanceStatus
  playersOnline: number
  maxPlayers: number
  ramAllocatedMb: number
  accentColor: string
  createdAt: string
}

export interface InstanceMetadata extends InstanceSummary {
  port: number
  javaPath: string | null
  /** Java major version this server requires, per the upstream project's own metadata. */
  javaMajor?: number
  /** Server-recommended JVM tuning flags (Paper publishes these). */
  jvmFlags?: string[]
  minRamMb: number
  maxRamMb: number
  eulaAccepted: boolean
  path: string
  toggles: InstanceToggles
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

export type PluginSource = 'modrinth' | 'hangar' | 'spiget' | 'curseforge'

export const pluginSourceLabels: Record<PluginSource, string> = {
  modrinth: 'Modrinth',
  hangar: 'Hangar',
  spiget: 'SpigotMC',
  curseforge: 'CurseForge'
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
  limit?: number
}

export interface PluginSearchResponse {
  results: PluginSearchResult[]
  /** Per-source failures, so one dead source doesn't hide the rest. */
  errors: { source: PluginSource; message: string }[]
}

export type ThemePreference = 'system' | 'dark' | 'light'

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
  consoleScrollbackLines: 2000
}
