import type { PluginSearchResult, PluginVersion } from '../../types/index'
import { fetchJson } from './provider'
import { getSettings } from '../../store/settingsStore'
import { searchPlugins } from './pluginRegistry'

const MODRINTH = 'https://api.modrinth.com/v2'
const CURSEFORGE = 'https://api.curseforge.com/v1'

interface ModrinthVersion {
  id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  files: Array<{ filename: string; url: string; primary: boolean; hashes: { sha1?: string } }>
}

interface CurseForgeFile {
  id: number
  displayName: string
  fileName: string
  downloadUrl: string | null
  gameVersions: string[]
}

/** Modpacks are a separate project type, so they get their own search path. */
/**
 * Modpacks, through the same path as everything else.
 *
 * This used to carry its own copies of the Modrinth and CurseForge calls,
 * which meant modpacks quietly missed every improvement the plugin browser
 * got: no pagination, no normalised platforms or game versions, no
 * compatibility verdict, and per-source failures swallowed rather than
 * reported. The providers now understand modpacks as a content kind, so the
 * registry can answer this and there is one search to maintain instead of two.
 */
export async function searchModpacks(
  query: string,
  limit: number,
  options?: { gameVersion?: string; offset?: number }
): Promise<PluginSearchResult[]> {
  const response = await searchPlugins({
    query,
    // Hangar hosts plugins only and Spiget is Bukkit-only, so neither has
    // modpacks to offer; asking them would just collect two errors per search.
    sources: ['modrinth', 'curseforge'],
    kind: 'modpack',
    gameVersion: options?.gameVersion,
    offset: options?.offset,
    limit,
    // Packs from different sources are genuinely different builds, so folding
    // them together by name would hide real choices rather than tidy them.
    mergeSources: false
  })
  return response.results
}

export async function listModpackVersions(
  source: PluginSearchResult['source'],
  projectId: string
): Promise<PluginVersion[]> {
  if (source === 'modrinth') {
    const versions = await fetchJson<ModrinthVersion[]>(`${MODRINTH}/project/${projectId}/version`)
    return versions.map((version): PluginVersion => {
      const file = version.files.find((f) => f.primary) ?? version.files[0]
      return {
        id: version.id,
        name: version.name,
        versionNumber: version.version_number,
        gameVersions: version.game_versions,
        loaders: version.loaders,
        downloadUrl: file?.url ?? null,
        externalUrl: null,
        filename: file?.filename ?? null,
        sha1: file?.hashes?.sha1 ?? null
      }
    })
  }

  const apiKey = getSettings().curseForgeApiKey?.trim()
  if (!apiKey) throw new Error('CurseForge API key is not set. Add one in Settings.')

  const data = await fetchJson<{ data: CurseForgeFile[] }>(
    `${CURSEFORGE}/mods/${projectId}/files?pageSize=25`,
    { headers: { 'x-api-key': apiKey } }
  )
  return data.data.map((file) => ({
    id: String(file.id),
    name: file.displayName,
    versionNumber: file.displayName,
    gameVersions: file.gameVersions ?? [],
    loaders: [],
    downloadUrl: file.downloadUrl,
    externalUrl: file.downloadUrl ? null : 'https://www.curseforge.com/minecraft/modpacks',
    filename: file.fileName,
    sha1: null
  }))
}
