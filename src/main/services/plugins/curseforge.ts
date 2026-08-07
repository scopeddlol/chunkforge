import type { PluginSearchResult, PluginVersion } from '../../../shared/types'
import { fetchJson, type PluginProvider } from './provider'
import { getSettings } from '../../store/settingsStore'

const BASE = 'https://api.curseforge.com/v1'
const MINECRAFT_GAME_ID = 432
const BUKKIT_PLUGINS_CLASS_ID = 5

interface CurseForgeMod {
  id: number
  name: string
  summary: string
  downloadCount: number
  logo?: { thumbnailUrl?: string }
  authors?: Array<{ name: string }>
  links?: { websiteUrl?: string }
  categories?: Array<{ name: string }>
}

interface CurseForgeSearchResponse {
  data: CurseForgeMod[]
}

interface CurseForgeFile {
  id: number
  displayName: string
  fileName: string
  downloadUrl: string | null
  gameVersions: string[]
  hashes?: Array<{ value: string; algo: number }>
}

interface CurseForgeFilesResponse {
  data: CurseForgeFile[]
}

function apiKey(): string | null {
  const key = getSettings().curseForgeApiKey?.trim()
  return key ? key : null
}

function authHeaders(): Record<string, string> {
  const key = apiKey()
  if (!key) throw new Error('CurseForge API key is not set. Add one in Settings.')
  return { 'x-api-key': key }
}

export const curseForgeProvider: PluginProvider = {
  source: 'curseforge',

  isAvailable: () => apiKey() !== null,

  async search(query, gameVersion, limit) {
    const params = new URLSearchParams({
      gameId: String(MINECRAFT_GAME_ID),
      classId: String(BUKKIT_PLUGINS_CLASS_ID),
      pageSize: String(limit),
      sortField: query ? '2' : '6', // 2 = popularity-weighted relevance, 6 = total downloads
      sortOrder: 'desc'
    })
    if (query) params.set('searchFilter', query)
    if (gameVersion) params.set('gameVersion', gameVersion)

    const data = await fetchJson<CurseForgeSearchResponse>(`${BASE}/mods/search?${params}`, {
      headers: authHeaders()
    })

    return data.data.map(
      (mod): PluginSearchResult => ({
        source: 'curseforge',
        id: String(mod.id),
        name: mod.name,
        summary: mod.summary,
        iconUrl: mod.logo?.thumbnailUrl ?? null,
        downloads: mod.downloadCount ?? 0,
        author: mod.authors?.[0]?.name ?? 'Unknown',
        sourceUrl: mod.links?.websiteUrl ?? `https://www.curseforge.com/minecraft/bukkit-plugins`,
        categories: (mod.categories ?? []).map((c) => c.name)
      })
    )
  },

  async listVersions(projectId) {
    const data = await fetchJson<CurseForgeFilesResponse>(`${BASE}/mods/${projectId}/files?pageSize=25`, {
      headers: authHeaders()
    })

    return data.data.map((file): PluginVersion => {
      // algo 1 = sha1 in CurseForge's hash enum.
      const sha1 = file.hashes?.find((h) => h.algo === 1)?.value ?? null
      return {
        id: String(file.id),
        name: file.displayName,
        versionNumber: file.displayName,
        gameVersions: file.gameVersions ?? [],
        loaders: ['bukkit', 'spigot', 'paper'],
        downloadUrl: file.downloadUrl,
        // Some CurseForge projects opt out of third-party API distribution.
        externalUrl: file.downloadUrl ? null : `https://www.curseforge.com/minecraft/bukkit-plugins`,
        filename: file.fileName,
        sha1
      }
    })
  }
}
