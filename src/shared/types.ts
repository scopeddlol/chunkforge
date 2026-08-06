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

export interface PluginSearchResult {
  source: PluginSource
  id: string
  name: string
  summary: string
  iconUrl: string | null
  downloads: number
  author: string
  sourceUrl: string
}
