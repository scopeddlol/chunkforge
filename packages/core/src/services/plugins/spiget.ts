import type { PluginSearchResult } from '../../types/index'
import { fetchJson, type PluginProvider } from './provider'

const BASE = 'https://api.spiget.org/v2'

interface SpigetResource {
  id: number
  name: string
  tag: string
  premium?: boolean
  external?: boolean
  downloads: number
  icon?: { url?: string }
  author?: { id: number }
  testedVersions?: string[]
  /** Unix seconds. */
  updateDate?: number
}

export const spigetProvider: PluginProvider = {
  source: 'spiget',

  isAvailable: () => true,

  async search(query, filters, limit) {
    // Spiget pages rather than offsets, and pages are 1-based. An offset that
    // is not a whole multiple of the page size cannot be expressed, which is
    // fine because the registry only ever advances by whole pages.
    const page = Math.floor((filters.offset ?? 0) / limit) + 1
    const params = new URLSearchParams({
      size: String(limit),
      page: String(page),
      sort: '-downloads',
      fields: 'id,name,tag,premium,external,downloads,icon,testedVersions,updateDate'
    })

    const url = query
      ? `${BASE}/search/resources/${encodeURIComponent(query)}?${params}`
      : `${BASE}/resources?${params}`

    const resources = await fetchJson<SpigetResource[]>(url)
    return resources.map(
      (resource): PluginSearchResult => ({
        source: 'spiget',
        id: String(resource.id),
        name: resource.name,
        summary: resource.tag,
        iconUrl: resource.icon?.url ? `https://www.spigotmc.org/${resource.icon.url}` : null,
        downloads: resource.downloads ?? 0,
        author: 'SpigotMC',
        sourceUrl: `https://www.spigotmc.org/resources/${resource.id}`,
        categories: resource.premium ? ['premium'] : [],
        // Everything on SpigotMC is a Bukkit-family server plugin.
        kind: 'plugin',
        // `testedVersions` is what the author ticked, and Spigot lists them as
        // minor lines like "1.21" — which the version matcher already reads as
        // covering the patch releases under it.
        gameVersions: resource.testedVersions,
        platforms: ['spigot'],
        updatedAt: resource.updateDate ? new Date(resource.updateDate * 1000).toISOString() : null
      })
    )
  },

  async listVersions(projectId) {
    const resource = await fetchJson<SpigetResource>(`${BASE}/resources/${projectId}`)
    const resourceUrl = `https://www.spigotmc.org/resources/${projectId}`

    // Spiget can only proxy downloads for free resources it hosts itself.
    // Premium and externally-hosted resources have to be fetched by the user.
    const canAutoDownload = !resource.premium && !resource.external

    return [
      {
        id: 'latest',
        name: 'Latest release',
        versionNumber: 'latest',
        gameVersions: resource.testedVersions ?? [],
        loaders: ['spigot', 'bukkit', 'paper'],
        downloadUrl: canAutoDownload ? `${BASE}/resources/${projectId}/download` : null,
        externalUrl: canAutoDownload ? null : resourceUrl,
        filename: null,
        sha1: null
      }
    ]
  }
}
