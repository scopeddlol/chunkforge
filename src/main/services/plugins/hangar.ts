import type { PluginSearchResult, PluginVersion } from '../../../shared/types'
import { fetchJson, type PluginProvider } from './provider'

const BASE = 'https://hangar.papermc.io/api/v1'

interface HangarProject {
  name: string
  namespace: { owner: string; slug: string }
  description: string
  avatarUrl: string | null
  category: string
  stats: { downloads: number }
}

interface HangarProjectsResponse {
  result: HangarProject[]
}

interface HangarVersion {
  name: string
  createdAt: string
  downloads: Record<string, { externalUrl: string | null; downloadUrl: string | null; fileInfo: { name?: string } | null }>
  platformDependencies: Record<string, string[]>
}

interface HangarVersionsResponse {
  result: HangarVersion[]
}

/** Hangar ids are "owner/slug"; version downloads are keyed by platform. */
function splitProjectId(projectId: string): { owner: string; slug: string } {
  const [owner, slug] = projectId.split('/')
  return { owner, slug }
}

export const hangarProvider: PluginProvider = {
  source: 'hangar',

  isAvailable: () => true,

  async search(query, _gameVersion, limit) {
    const params = new URLSearchParams({ limit: String(limit), offset: '0' })
    if (query) params.set('query', query)
    else params.set('sort', '-downloads')

    const data = await fetchJson<HangarProjectsResponse>(`${BASE}/projects?${params}`)
    return data.result.map(
      (project): PluginSearchResult => ({
        source: 'hangar',
        id: `${project.namespace.owner}/${project.namespace.slug}`,
        name: project.name,
        summary: project.description,
        iconUrl: project.avatarUrl,
        downloads: project.stats?.downloads ?? 0,
        author: project.namespace.owner,
        sourceUrl: `https://hangar.papermc.io/${project.namespace.owner}/${project.namespace.slug}`,
        categories: project.category ? [project.category.replace(/_/g, ' ')] : []
      })
    )
  },

  async listVersions(projectId) {
    const { owner, slug } = splitProjectId(projectId)
    const data = await fetchJson<HangarVersionsResponse>(
      `${BASE}/projects/${owner}/${slug}/versions?limit=25&offset=0`
    )

    return data.result.map((version): PluginVersion => {
      const platforms = Object.keys(version.downloads)
      const platform = platforms.includes('PAPER') ? 'PAPER' : platforms[0]
      const download = platform ? version.downloads[platform] : undefined

      // Hangar proxies its own hosted files through this endpoint; projects that
      // host releases elsewhere (GitHub, Jenkins) only expose an externalUrl.
      const hangarDownloadUrl = download?.externalUrl
        ? null
        : `${BASE}/projects/${owner}/${slug}/versions/${encodeURIComponent(version.name)}/${platform}/download`

      return {
        id: version.name,
        name: version.name,
        versionNumber: version.name,
        gameVersions: platform ? (version.platformDependencies?.[platform] ?? []) : [],
        loaders: platforms.map((p) => p.toLowerCase()),
        downloadUrl: download?.downloadUrl ?? hangarDownloadUrl,
        externalUrl: download?.externalUrl ?? null,
        filename: download?.fileInfo?.name ?? null,
        sha1: null
      }
    })
  }
}
