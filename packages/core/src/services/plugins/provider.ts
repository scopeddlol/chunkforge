import type { ContentKind, PluginSearchResult, PluginSource, PluginVersion } from '../../types/index'

export interface SearchFilters {
  gameVersion?: string
  /** Loader id such as "paper" or "fabric"; ignored by sources that don't model it. */
  loader?: string
  /**
   * Results to skip. Sources paginate by offset, page number or cursor; each
   * provider converts this to whatever its API wants so callers only ever
   * think in offsets.
   */
  offset?: number
  /** Restricts to one content kind. Omit to let the provider decide. */
  kind?: ContentKind
}

/**
 * What the caller already knows about the server a file is destined for.
 *
 * Passed down so a provider can narrow at the API rather than downloading a
 * project's entire history — some have hundreds of builds. Deliberately never
 * used to filter by *loader*: the whole point of asking is to be able to say
 * "this project only ships Fabric builds for your version", and a list already
 * filtered to Paper cannot tell you that.
 */
export interface VersionQuery {
  /** Narrows to builds for one Minecraft version where the API supports it. */
  gameVersion?: string
  /** The kind the project was found under, for sources that infer from it. */
  kind?: ContentKind
}

export interface PluginProvider {
  readonly source: PluginSource
  /** Whether the provider is usable right now (e.g. CurseForge needs an API key). */
  isAvailable(): boolean
  search(query: string, filters: SearchFilters, limit: number): Promise<PluginSearchResult[]>
  listVersions(projectId: string, query?: VersionQuery): Promise<PluginVersion[]>
  /**
   * One project by id.
   *
   * Needed to follow a dependency, which names a project rather than
   * describing it, and to read the side support that decides whether a mod
   * belongs on a server at all. Optional because not every source can answer
   * it — a source that cannot simply contributes no dependency graph.
   */
  getProject?(projectId: string, kind?: ContentKind): Promise<PluginSearchResult | null>
  /**
   * Identifies an already-installed file by its SHA-1.
   *
   * The only trustworthy way to say what a jar on disk actually is — filenames
   * are renamed, shaded and versioned by hand, and guessing from them is how
   * an audit ends up deleting the wrong mod. A source that cannot answer
   * simply leaves the file unidentified, which is reported as such.
   */
  lookupByHash?(sha1: string): Promise<{ projectId: string; version: PluginVersion } | null>
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      // Both Modrinth and Hangar ask API consumers to identify themselves.
      'User-Agent': 'Chunkforge/0.1.0 (Minecraft server manager)',
      Accept: 'application/json',
      ...init?.headers
    }
  })
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`)
  return response.json() as Promise<T>
}
