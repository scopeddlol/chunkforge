import type {
  ContentDependency,
  ContentKind,
  ContentPlatform,
  PluginSearchResult,
  PluginVersion,
  SideSupport
} from '../../types/index'
import { toPlatform } from './compatibility'

/** Modrinth's project_type maps onto our kinds directly, bar the naming. */
function toKind(projectType: string | undefined): ContentKind | null {
  if (projectType === 'plugin' || projectType === 'mod' || projectType === 'modpack') {
    return projectType
  }
  return null
}
import { fetchJson, type PluginProvider, type VersionQuery } from './provider'

/**
 * Overridable so an operator behind a mirror — or a test harness with no
 * outbound access — can point Chunkforge somewhere else. Defaults to Modrinth
 * itself, which is what every ordinary install uses.
 */
const BASE = process.env.CHUNKFORGE_MODRINTH_API ?? 'https://api.modrinth.com/v2'

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
  client_side?: string
  server_side?: string
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
  date_published?: string
  dependencies?: Array<{
    project_id: string | null
    version_id: string | null
    dependency_type: string
  }>
  files: Array<{
    filename: string
    url: string
    primary: boolean
    hashes: { sha1?: string }
  }>
}

const DEPENDENCY_KINDS: Record<string, ContentDependency['kind']> = {
  required: 'required',
  optional: 'optional',
  incompatible: 'incompatible',
  embedded: 'embedded'
}

/** Modrinth's side fields use exactly our vocabulary bar the missing case. */
function toSide(raw: string | undefined): SideSupport {
  return raw === 'required' || raw === 'optional' || raw === 'unsupported' ? raw : 'unknown'
}

export const modrinthProvider: PluginProvider = {
  source: 'modrinth',

  isAvailable: () => true,

  async search(query, filters, limit) {
    const { gameVersion, loader, offset, kind } = filters
    // Modrinth facets are AND-ed across groups, OR-ed within a group.

    /**
     * Without an explicit kind, search mods *and* plugins together.
     *
     * Modrinth's project_type is about where a project mainly lives, not what
     * it can run on: Simple Voice Chat is typed `mod` and ships Paper builds
     * all the same. Inferring the type from the loader — plugin loader means
     * plugin — is what made it invisible to a Paper server, so the loader
     * facet is left to do that job, since it filters on what a project
     * actually publishes.
     */
    const projectTypes: ContentKind[] = kind ? [kind] : ['mod', 'plugin']
    const facets: string[][] = [projectTypes.map((t) => `project_type:${t}`)]
    /**
     * Exclude client-only projects, and nothing else.
     *
     * Listings otherwise fill up with shaders and minimaps that do nothing on
     * a server. `unknown` is deliberately kept: it means the author never set
     * the field, which is common on older projects, and dropping it would hide
     * working plugins to avoid showing a few useless ones — the wrong trade in
     * a browser whose job is to find things.
     */
    facets.push(['server_side:required', 'server_side:optional', 'server_side:unknown'])
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
        kind: toKind(hit.project_type) ?? projectTypes[0],
        gameVersions: hit.versions,
        // Modrinth files loaders into the same `categories` array as themes
        // like "adventure", so the platform list is whatever normalises.
        platforms: (hit.categories ?? [])
          .map(toPlatform)
          .filter((p): p is ContentPlatform => p !== null),
        updatedAt: hit.date_modified ?? null,
        clientSide: toSide(hit.client_side),
        serverSide: toSide(hit.server_side)
      })
    )
  },

  async listVersions(projectId, query?: VersionQuery) {
    /**
     * Narrowed by game version, never by loader.
     *
     * A project like Simple Voice Chat ships builds for eight loaders across
     * dozens of Minecraft versions, and asking for all of them is a large
     * download to answer one question. Filtering by the target version cuts it
     * to a handful while keeping every loader visible — which is what lets the
     * caller say "this exists, but only for Fabric" instead of "nothing found".
     */
    const params = new URLSearchParams()
    if (query?.gameVersion) params.set('game_versions', JSON.stringify([query.gameVersion]))
    const suffix = params.toString() ? `?${params}` : ''

    let versions = await fetchJson<ModrinthVersion[]>(
      `${BASE}/project/${projectId}/version${suffix}`
    )
    // Nothing for that version at all — fall back to the full history so the
    // caller can explain which versions *are* supported rather than showing an
    // empty list that looks like a broken search.
    if (versions.length === 0 && suffix) {
      versions = await fetchJson<ModrinthVersion[]>(`${BASE}/project/${projectId}/version`)
    }

    return versions.map((version): PluginVersion => {
      const file = version.files.find((f) => f.primary) ?? version.files[0]
      return {
        id: version.id,
        name: version.name,
        versionNumber: version.version_number,
        gameVersions: version.game_versions,
        loaders: version.loaders,
        platforms: version.loaders
          .map(toPlatform)
          .filter((p): p is ContentPlatform => p !== null),
        downloadUrl: file?.url ?? null,
        externalUrl: null,
        filename: file?.filename ?? null,
        sha1: file?.hashes?.sha1 ?? null,
        releasedAt: version.date_published ?? null,
        dependencies: (version.dependencies ?? [])
          .filter((d) => d.project_id)
          .map((d) => ({
            source: 'modrinth' as const,
            projectId: d.project_id as string,
            versionId: d.version_id ?? undefined,
            kind: DEPENDENCY_KINDS[d.dependency_type] ?? 'optional'
          }))
      }
    })
  }
}
