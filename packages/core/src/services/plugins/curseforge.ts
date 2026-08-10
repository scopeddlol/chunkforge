import type {
  ContentDependency,
  ContentKind,
  ContentPlatform,
  PluginSearchResult,
  PluginVersion
} from '../../types/index'
import { toPlatform } from './compatibility'
import { fetchJson, type PluginProvider, type VersionQuery } from './provider'
import { getSettings } from '../../store/settingsStore'

/** Overridable for mirrors and offline testing; defaults to CurseForge. */
const BASE = process.env.CHUNKFORGE_CURSEFORGE_API ?? 'https://api.curseforge.com/v1'
const MINECRAFT_GAME_ID = 432
const BUKKIT_PLUGINS_CLASS_ID = 5
const MODS_CLASS_ID = 6
const MODPACKS_CLASS_ID = 4471

/** CurseForge separates its catalogue by class id rather than a type field. */
const CLASS_ID_BY_KIND: Record<ContentKind, number> = {
  plugin: BUKKIT_PLUGINS_CLASS_ID,
  mod: MODS_CLASS_ID,
  modpack: MODPACKS_CLASS_ID
}

/**
 * CurseForge tags loader support as numbered "mod loader types" on each file,
 * and repeats the loader name in latestFilesIndexes. The names are what comes
 * back in search results, so that is what gets normalised.
 */
function platformsFor(mod: CurseForgeMod, kind: ContentKind): ContentPlatform[] {
  const named = (mod.latestFilesIndexes ?? [])
    .map((f) => (f.modLoader === undefined ? null : MOD_LOADER_NAMES[f.modLoader] ?? null))
    .filter((v): v is string => v !== null)
  const platforms = named.map(toPlatform).filter((p): p is ContentPlatform => p !== null)
  if (platforms.length > 0) return [...new Set(platforms)]
  // Bukkit-plugin listings carry no loader tags at all; the class they were
  // searched under is the only signal, and it is a reliable one.
  return kind === 'plugin' ? ['spigot'] : []
}

/** CurseForge's numeric modLoaderType enum. */
const MOD_LOADER_NAMES: Record<number, string> = {
  1: 'forge',
  4: 'fabric',
  5: 'quilt',
  6: 'neoforge'
}

interface CurseForgeMod {
  id: number
  name: string
  summary: string
  downloadCount: number
  logo?: { thumbnailUrl?: string }
  authors?: Array<{ name: string }>
  links?: { websiteUrl?: string }
  categories?: Array<{ name: string }>
  dateModified?: string
  latestFilesIndexes?: Array<{ gameVersion?: string; modLoader?: number }>
}

interface CurseForgeSearchResponse {
  data: CurseForgeMod[]
}

interface CurseForgeFile {
  id: number
  displayName: string
  fileName: string
  downloadUrl: string | null
  /** Mixed bag: Minecraft versions, loader names, "Server", "Java 21". */
  gameVersions: string[]
  fileDate?: string
  hashes?: Array<{ value: string; algo: number }>
  dependencies?: Array<{ modId: number; relationType: number }>
}

/**
 * CurseForge's file relation enum. 3 is the interesting one; 2 and 5 are
 * "optional" and "tool", and 4 means the dependency is already inside the jar.
 */
const RELATION_KINDS: Record<number, ContentDependency['kind']> = {
  2: 'optional',
  3: 'required',
  4: 'embedded',
  5: 'incompatible'
}

/**
 * Splits CurseForge's `gameVersions` into the two things it actually contains.
 *
 * The array is untyped and mixes Minecraft versions with loader names and
 * environment tags — `["1.21.1", "Fabric", "Server", "Java 21"]`. The previous
 * code ignored it and hardcoded every file as a Bukkit plugin, which is how a
 * Fabric mod could be reported as installable on Paper. Anything that reads as
 * a version number is a version; anything that normalises to a platform is a
 * loader; everything else is ignored rather than guessed at.
 */
function splitGameVersions(raw: string[]): { versions: string[]; platforms: ContentPlatform[] } {
  const versions: string[] = []
  const platforms: ContentPlatform[] = []
  for (const entry of raw ?? []) {
    if (/^\d+\.\d+(\.\d+)?$/.test(entry.trim())) {
      versions.push(entry.trim())
      continue
    }
    const platform = toPlatform(entry)
    if (platform) platforms.push(platform)
  }
  return { versions, platforms: [...new Set(platforms)] }
}

interface CurseForgeFilesResponse {
  data: CurseForgeFile[]
}

function apiKey(): string | null {
  const key = getSettings().curseForgeApiKey?.trim()
  return key ? key : null
}

function authHeaders(): Record<string, string> {
  const key = apiKey()
  if (!key) throw new Error('CurseForge API key is not set. Add one in Settings.')
  return { 'x-api-key': key }
}

/** What a key check found out. */
export interface CurseForgeKeyStatus {
  configured: boolean
  valid: boolean
  message: string
}

/**
 * Checks a CurseForge key by actually calling CurseForge.
 *
 * A key that is merely *present* tells you nothing — a typo or a revoked key
 * looks identical to a good one until a search quietly returns nothing or a
 * modpack install dies halfway through. `/v1/games` is the cheapest endpoint
 * that still requires authentication, so it answers the only question that
 * matters: will this credential work when it is needed?
 *
 * Pass a key to test one before saving it; omit to test the saved one.
 */
export async function verifyCurseForgeKey(candidate?: string): Promise<CurseForgeKeyStatus> {
  const key = candidate?.trim() || apiKey()
  if (!key) {
    return { configured: false, valid: false, message: 'No CurseForge API key is set.' }
  }
  try {
    const response = await fetch(`${BASE}/games`, {
      headers: { 'x-api-key': key, Accept: 'application/json' }
    })
    if (response.status === 401 || response.status === 403) {
      return { configured: true, valid: false, message: 'CurseForge rejected that key.' }
    }
    if (!response.ok) {
      // Not the key's fault — say so rather than telling someone to replace a
      // credential that is probably fine.
      return {
        configured: true,
        valid: false,
        message: `CurseForge answered ${response.status}. Try again shortly.`
      }
    }
    return { configured: true, valid: true, message: 'Key works.' }
  } catch (err) {
    return {
      configured: true,
      valid: false,
      message: `Could not reach CurseForge: ${(err as Error).message}`
    }
  }
}

export const curseForgeProvider: PluginProvider = {
  source: 'curseforge',

  isAvailable: () => apiKey() !== null,

  async search(query, filters, limit) {
    const { gameVersion, offset } = filters
    const kind: ContentKind = filters.kind ?? 'plugin'
    const params = new URLSearchParams({
      gameId: String(MINECRAFT_GAME_ID),
      classId: String(CLASS_ID_BY_KIND[kind]),
      pageSize: String(limit),
      index: String(offset ?? 0),
      sortField: query ? '2' : '6', // 2 = popularity-weighted relevance, 6 = total downloads
      sortOrder: 'desc'
    })
    if (query) params.set('searchFilter', query)
    if (gameVersion) params.set('gameVersion', gameVersion)

    const data = await fetchJson<CurseForgeSearchResponse>(`${BASE}/mods/search?${params}`, {
      headers: authHeaders()
    })

    return data.data.map(
      (mod): PluginSearchResult => ({
        source: 'curseforge',
        id: String(mod.id),
        name: mod.name,
        summary: mod.summary,
        iconUrl: mod.logo?.thumbnailUrl ?? null,
        downloads: mod.downloadCount ?? 0,
        author: mod.authors?.[0]?.name ?? 'Unknown',
        sourceUrl: mod.links?.websiteUrl ?? `https://www.curseforge.com/minecraft/bukkit-plugins`,
        categories: (mod.categories ?? []).map((c) => c.name),
        kind,
        gameVersions: [
          ...new Set(
            (mod.latestFilesIndexes ?? [])
              .map((f) => f.gameVersion)
              .filter((v): v is string => Boolean(v))
          )
        ],
        platforms: platformsFor(mod, kind),
        updatedAt: mod.dateModified ?? null
      })
    )
  },

  async getProject(projectId, kind) {
    const data = await fetchJson<{ data: CurseForgeMod }>(`${BASE}/mods/${projectId}`, {
      headers: authHeaders()
    })
    const mod = data.data
    const resolvedKind: ContentKind = kind ?? 'mod'
    return {
      source: 'curseforge' as const,
      id: String(mod.id),
      name: mod.name,
      summary: mod.summary,
      iconUrl: mod.logo?.thumbnailUrl ?? null,
      downloads: mod.downloadCount ?? 0,
      author: mod.authors?.[0]?.name ?? 'Unknown',
      sourceUrl: mod.links?.websiteUrl ?? 'https://www.curseforge.com/minecraft',
      categories: (mod.categories ?? []).map((c) => c.name),
      kind: resolvedKind,
      gameVersions: [
        ...new Set(
          (mod.latestFilesIndexes ?? [])
            .map((f) => f.gameVersion)
            .filter((v): v is string => Boolean(v))
        )
      ],
      platforms: platformsFor(mod, resolvedKind)
      // CurseForge publishes no client/server split, so both stay unknown
      // rather than being guessed at from the category list.
    }
  },

  async listVersions(projectId, query?: VersionQuery) {
    const params = new URLSearchParams({ pageSize: '50' })
    // A server-side narrow that only ever removes files for other Minecraft
    // versions, which keeps every loader for the target version visible.
    if (query?.gameVersion) params.set('gameVersion', query.gameVersion)

    let data = await fetchJson<CurseForgeFilesResponse>(
      `${BASE}/mods/${projectId}/files?${params}`,
      { headers: authHeaders() }
    )
    if (data.data.length === 0 && query?.gameVersion) {
      data = await fetchJson<CurseForgeFilesResponse>(`${BASE}/mods/${projectId}/files?pageSize=50`, {
        headers: authHeaders()
      })
    }

    return data.data.map((file): PluginVersion => {
      // algo 1 = sha1 in CurseForge's hash enum.
      const sha1 = file.hashes?.find((h) => h.algo === 1)?.value ?? null
      const { versions, platforms } = splitGameVersions(file.gameVersions ?? [])
      /**
       * A Bukkit-class file that tagged no loader is a Bukkit-family plugin.
       *
       * That is a safe inference *only* because the class it was searched
       * under says so — the same assumption applied to a mod is exactly the
       * bug this replaces, so it is made from `kind` and never unconditionally.
       */
      const resolved =
        platforms.length > 0
          ? platforms
          : query?.kind === 'plugin'
            ? (['bukkit', 'spigot', 'paper'] as ContentPlatform[])
            : []

      return {
        id: String(file.id),
        name: file.displayName,
        versionNumber: file.displayName,
        gameVersions: versions,
        loaders: resolved,
        platforms: resolved,
        downloadUrl: file.downloadUrl,
        // Some CurseForge projects opt out of third-party API distribution.
        externalUrl: file.downloadUrl ? null : `https://www.curseforge.com/minecraft/bukkit-plugins`,
        filename: file.fileName,
        sha1,
        releasedAt: file.fileDate ?? null,
        dependencies: (file.dependencies ?? [])
          .filter((d) => RELATION_KINDS[d.relationType])
          .map((d) => ({
            source: 'curseforge' as const,
            projectId: String(d.modId),
            kind: RELATION_KINDS[d.relationType]
          }))
      }
    })
  }
}
