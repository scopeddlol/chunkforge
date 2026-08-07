import type { PluginSearchResult, PluginVersion } from '../../types/index'
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
    const { gameVersion, loader } = filters
    // Modrinth facets are AND-ed across groups, OR-ed within a group.
    // Mods are included only when a mod loader is selected; otherwise they flood
    // results with client-side mods (Sodium, Iris) that are useless on a server.
    const isModLoader = loader === 'fabric' || loader === 'forge' || loader === 'neoforge'
    const facets: string[][] = [isModLoader ? ['project_type:mod'] : ['project_type:plugin']]
    // Mod listings otherwise fill up with client-only projects (Sodium, Iris)
    // that do nothing on a server.
    if (isModLoader) facets.push(['server_side:required', 'server_side:optional'])
    if (gameVersion) facets.push([`versions:${gameVersion}`])
    if (loader) facets.push([`categories:${loader}`])

    const params = new URLSearchParams({
      query,
      limit: String(limit),
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
        sourceUrl: `https://modrinth.com/plugin/${hit.slug}`,
        categories: hit.categories ?? []
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
