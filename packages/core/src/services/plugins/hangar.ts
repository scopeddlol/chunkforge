import type { ContentPlatform, PluginSearchResult, PluginVersion } from '../../types/index'
import { fetchJson, type PluginProvider } from './provider'
import { toPlatform } from './compatibility'

/**
 * Hangar reports versions per platform. The browser compares against one game
 * version at a time, so the union across platforms is what matters here; the
 * platform check is a separate test in the compatibility engine.
 */
function flattenVersions(supported: Record<string, string[]> | undefined): string[] | undefined {
  if (!supported) return undefined
  const all = new Set<string>()
  for (const versions of Object.values(supported)) {
    for (const version of versions ?? []) all.add(version)
  }
  return all.size > 0 ? [...all] : undefined
}

const BASE = 'https://hangar.papermc.io/api/v1'

interface HangarProject {
  name: string
  namespace: { owner: string; slug: string }
  description: string
  avatarUrl: string | null
  category: string
  stats: { downloads: number }
  lastUpdated?: string
  /** Platform -> supported Minecraft versions, e.g. { PAPER: ["1.21", ...] }. */
  supportedPlatforms?: Record<string, string[]>
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

  async search(query, filters, limit) {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(filters.offset ?? 0)
    })
    // Hangar filters by the Minecraft version a project declares support for.
    if (filters.gameVersion) params.set('version', filters.gameVersion)
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
        categories: project.category ? [project.category.replace(/_/g, ' ')] : [],
        // Hangar only hosts server plugins, so the kind is never in doubt.
        kind: 'plugin',
        gameVersions: flattenVersions(project.supportedPlatforms),
        platforms: Object.keys(project.supportedPlatforms ?? {})
          .map(toPlatform)
          .filter((p): p is ContentPlatform => p !== null),
        updatedAt: project.lastUpdated ?? null
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
