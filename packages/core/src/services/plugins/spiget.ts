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
}

export const spigetProvider: PluginProvider = {
  source: 'spiget',

  isAvailable: () => true,

  async search(query, _filters, limit) {
    const params = new URLSearchParams({
      size: String(limit),
      sort: '-downloads',
      fields: 'id,name,tag,premium,external,downloads,icon,testedVersions'
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
        categories: resource.premium ? ['premium'] : []
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
