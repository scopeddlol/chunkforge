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
