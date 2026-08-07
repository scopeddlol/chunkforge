import type { PluginSearchResult, PluginVersion } from '../../types/index'
import { fetchJson } from './provider'
import { getSettings } from '../../store/settingsStore'

const MODRINTH = 'https://api.modrinth.com/v2'
const CURSEFORGE = 'https://api.curseforge.com/v1'
const MINECRAFT_GAME_ID = 432
const MODPACKS_CLASS_ID = 4471

interface ModrinthHit {
  slug: string
  title: string
  description: string
  icon_url: string | null
  downloads: number
  author: string
  categories: string[]
}

interface ModrinthVersion {
  id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  files: Array<{ filename: string; url: string; primary: boolean; hashes: { sha1?: string } }>
}

interface CurseForgeMod {
  id: number
  name: string
  summary: string
  downloadCount: number
  logo?: { thumbnailUrl?: string }
  authors?: Array<{ name: string }>
  links?: { websiteUrl?: string }
}

interface CurseForgeFile {
  id: number
  displayName: string
  fileName: string
  downloadUrl: string | null
  gameVersions: string[]
}

/** Modpacks are a separate project type, so they get their own search path. */
export async function searchModpacks(query: string, limit: number): Promise<PluginSearchResult[]> {
  const results: PluginSearchResult[] = []

  // Server-side facet keeps client-only packs out of a server manager.
  const facets = JSON.stringify([
    ['project_type:modpack'],
    ['server_side:required', 'server_side:optional']
  ])
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    index: query ? 'relevance' : 'downloads',
    facets
  })

  try {
    const data = await fetchJson<{ hits: ModrinthHit[] }>(`${MODRINTH}/search?${params}`)
    results.push(
      ...data.hits.map(
        (hit): PluginSearchResult => ({
          source: 'modrinth',
          id: hit.slug,
          name: hit.title,
          summary: hit.description,
          iconUrl: hit.icon_url,
          downloads: hit.downloads,
          author: hit.author,
          sourceUrl: `https://modrinth.com/modpack/${hit.slug}`,
          categories: hit.categories ?? []
        })
      )
    )
  } catch {
    // Modrinth being down shouldn't hide CurseForge results.
  }

  const apiKey = getSettings().curseForgeApiKey?.trim()
  if (apiKey) {
    try {
      const cfParams = new URLSearchParams({
        gameId: String(MINECRAFT_GAME_ID),
        classId: String(MODPACKS_CLASS_ID),
        pageSize: String(limit),
        sortField: query ? '2' : '6',
        sortOrder: 'desc'
      })
      if (query) cfParams.set('searchFilter', query)

      const data = await fetchJson<{ data: CurseForgeMod[] }>(`${CURSEFORGE}/mods/search?${cfParams}`, {
        headers: { 'x-api-key': apiKey }
      })
      results.push(
        ...data.data.map(
          (mod): PluginSearchResult => ({
            source: 'curseforge',
            id: String(mod.id),
            name: mod.name,
            summary: mod.summary,
            iconUrl: mod.logo?.thumbnailUrl ?? null,
            downloads: mod.downloadCount ?? 0,
            author: mod.authors?.[0]?.name ?? 'Unknown',
            sourceUrl: mod.links?.websiteUrl ?? 'https://www.curseforge.com/minecraft/modpacks',
            categories: []
          })
        )
      )
    } catch {
      // Same reasoning as above.
    }
  }

  return results.sort((a, b) => b.downloads - a.downloads)
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
