import type { PluginSearchResult, PluginVersion } from '../../../shared/types'
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

  async search(query, gameVersion, limit) {
    // Modrinth facets are AND-ed across groups, OR-ed within a group.
    // Restricted to plugins: including project_type:mod floods the results with
    // client-side mods (Sodium, Iris) that are useless on a server.
    const facets: string[][] = [['project_type:plugin']]
    if (gameVersion) facets.push([`versions:${gameVersion}`])

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
