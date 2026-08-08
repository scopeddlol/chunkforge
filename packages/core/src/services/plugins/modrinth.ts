import type {
  ContentKind,
  ContentPlatform,
  PluginSearchResult,
  PluginVersion
} from '../../types/index'
import { toPlatform } from './compatibility'

/** Modrinth's project_type maps onto our kinds directly, bar the naming. */
function toKind(projectType: string | undefined): ContentKind | null {
  if (projectType === 'plugin' || projectType === 'mod' || projectType === 'modpack') {
    return projectType
  }
  return null
}
import { fetchJson, type PluginProvider } from './provider'

const BASE = 'https://api.modrinth.com/v2'

interface ModrinthHit {
  project_id: string
  slug: string
  title: string
  description: string
  icon_url: string | null
  downloads: number
  author: string
  categories: string[]
  versions?: string[]
  project_type?: string
  date_modified?: string
}

interface ModrinthSearchResponse {
  hits: ModrinthHit[]
}

interface ModrinthVersion {
  id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  files: Array<{
    filename: string
    url: string
    primary: boolean
    hashes: { sha1?: string }
  }>
}

export const modrinthProvider: PluginProvider = {
  source: 'modrinth',

  isAvailable: () => true,

  async search(query, filters, limit) {
    const { gameVersion, loader, offset, kind } = filters
    // Modrinth facets are AND-ed across groups, OR-ed within a group.
    const isModLoader = loader === 'fabric' || loader === 'forge' || loader === 'neoforge'
    // An explicit kind wins; without one, the selected loader is the best
    // signal for whether the user is after plugins or mods.
    const projectType = kind ?? (isModLoader ? 'mod' : 'plugin')
    const facets: string[][] = [[`project_type:${projectType}`]]
    // Mod and modpack listings otherwise fill up with client-only projects
    // (Sodium, Iris) that do nothing on a server.
    if (projectType !== 'plugin') facets.push(['server_side:required', 'server_side:optional'])
    if (gameVersion) facets.push([`versions:${gameVersion}`])
    if (loader) facets.push([`categories:${loader}`])

    const params = new URLSearchParams({
      query,
      limit: String(limit),
      offset: String(offset ?? 0),
      index: query ? 'relevance' : 'downloads',
      facets: JSON.stringify(facets)
    })

    const data = await fetchJson<ModrinthSearchResponse>(`${BASE}/search?${params}`)
    return data.hits.map(
      (hit): PluginSearchResult => ({
        source: 'modrinth',
        id: hit.slug,
        name: hit.title,
        summary: hit.description,
        iconUrl: hit.icon_url,
        downloads: hit.downloads,
        author: hit.author,
        sourceUrl: `https://modrinth.com/${hit.project_type ?? 'plugin'}/${hit.slug}`,
        categories: hit.categories ?? [],
        kind: toKind(hit.project_type) ?? (projectType as ContentKind),
        gameVersions: hit.versions,
        // Modrinth files loaders into the same `categories` array as themes
        // like "adventure", so the platform list is whatever normalises.
        platforms: (hit.categories ?? [])
          .map(toPlatform)
          .filter((p): p is ContentPlatform => p !== null),
        updatedAt: hit.date_modified ?? null
      })
    )
  },

  async listVersions(projectId) {
    const versions = await fetchJson<ModrinthVersion[]>(`${BASE}/project/${projectId}/version`)
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
}
