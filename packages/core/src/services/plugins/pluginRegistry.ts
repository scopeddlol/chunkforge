import { existsSync } from 'fs'
import { mkdir, readdir, rename, rm, stat } from 'fs/promises'
import { join } from 'path'
import type {
  InstalledPlugin,
  PluginSearchQuery,
  PluginSearchResponse,
  PluginSearchResult,
  PluginSource,
  PluginVersion,
  ServerType
} from '../../types/index'
import { addOnFolder } from '../../types/index'
import { downloadFile } from '../downloadFile'
import type { PluginProvider } from './provider'
import { modrinthProvider } from './modrinth'
import { hangarProvider } from './hangar'
import { spigetProvider } from './spiget'
import { curseForgeProvider } from './curseforge'

const providers: Record<PluginSource, PluginProvider> = {
  modrinth: modrinthProvider,
  hangar: hangarProvider,
  spiget: spigetProvider,
  curseforge: curseForgeProvider
}

export function getProvider(source: PluginSource): PluginProvider {
  return providers[source]
}

export function availableSources(): PluginSource[] {
  return (Object.keys(providers) as PluginSource[]).filter((s) => providers[s].isAvailable())
}

/**
 * Fans out to every requested source in parallel. A source that fails or is
 * unconfigured is reported in `errors` rather than failing the whole search.
 */
export async function searchPlugins(query: PluginSearchQuery): Promise<PluginSearchResponse> {
  const limit = query.limit ?? 20
  const requested = query.sources.length > 0 ? query.sources : (Object.keys(providers) as PluginSource[])

  const settled = await Promise.all(
    requested.map(async (source) => {
      const provider = providers[source]
      if (!provider.isAvailable()) {
        return { source, error: `${source} is not configured` as string | null, results: [] }
      }
      try {
        const results = await provider.search(
          query.query,
          { gameVersion: query.gameVersion, loader: query.loader },
          limit
        )
        return { source, error: null, results }
      } catch (err) {
        return { source, error: (err as Error).message, results: [] }
      }
    })
  )

  // Interleave sources so no single one dominates the top of the grid.
  const buckets = settled.map((s) => s.results)
  const interleaved: PluginSearchResult[] = []
  const maxLen = Math.max(0, ...buckets.map((b) => b.length))
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (bucket[i]) interleaved.push(bucket[i])
    }
  }

  return {
    results: query.mergeSources === false ? interleaved : mergeByIdentity(interleaved),
    errors: settled
      .filter((s) => s.error !== null)
      .map((s) => ({ source: s.source, message: s.error as string }))
  }
}

// Platform suffixes and filler words that differ between listings of the same
// project — e.g. "WorldEdit" vs "WorldEdit for Bukkit".
const NAME_NOISE = /\b(bukkit|spigot|paper|papermc|folia|plugin|mod|reloaded|continued|fork|for|the|minecraft|mc)\b/g

/** Normalises a plugin name so the same project from different sources collides. */
function identityKey(result: PluginSearchResult): string {
  return result.name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(NAME_NOISE, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

/**
 * Collapses the same plugin found on several sources into one entry, keeping
 * every source as an alternative so the user picks at download time. The entry
 * with the most downloads supplies the display metadata.
 */
function mergeByIdentity(results: PluginSearchResult[]): PluginSearchResult[] {
  const groups = new Map<string, PluginSearchResult[]>()
  for (const result of results) {
    const key = identityKey(result)
    // Names that normalise to nothing can't be matched reliably; keep separate.
    if (!key) {
      groups.set(`${result.source}:${result.id}`, [result])
      continue
    }
    const existing = groups.get(key)
    if (existing) existing.push(result)
    else groups.set(key, [result])
  }

  const merged: PluginSearchResult[] = []
  for (const group of groups.values()) {
    const ranked = [...group].sort((a, b) => b.downloads - a.downloads)
    const primary = ranked[0]
    merged.push({
      ...primary,
      // Combined download count reads as the project's real reach.
      downloads: ranked.reduce((sum, r) => sum + r.downloads, 0),
      alternatives: ranked.slice(1).map((r) => ({
        source: r.source,
        id: r.id,
        downloads: r.downloads,
        sourceUrl: r.sourceUrl
      }))
    })
  }

  return merged.sort((a, b) => b.downloads - a.downloads)
}

export async function listPluginVersions(source: PluginSource, projectId: string): Promise<PluginVersion[]> {
  return providers[source].listVersions(projectId)
}

/** Mods and plugins live in different folders, so callers pass the server type. */
function addOnsDir(instancePath: string, serverType: ServerType): string {
  return join(instancePath, addOnFolder(serverType))
}

export async function listInstalledPlugins(
  instancePath: string,
  serverType: ServerType
): Promise<InstalledPlugin[]> {
  const dir = addOnsDir(instancePath, serverType)
  if (!existsSync(dir)) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const plugins: InstalledPlugin[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    // Chunkforge disables a plugin by suffixing it, matching the common convention.
    const isJar = entry.name.endsWith('.jar')
    const isDisabled = entry.name.endsWith('.jar.disabled')
    if (!isJar && !isDisabled) continue

    const info = await stat(join(dir, entry.name))
    plugins.push({ filename: entry.name, sizeBytes: info.size, enabled: isJar })
  }

  return plugins.sort((a, b) => a.filename.localeCompare(b.filename))
}

export async function installPlugin(
  instancePath: string,
  serverType: ServerType,
  version: PluginVersion,
  fallbackName: string,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  if (!version.downloadUrl) {
    throw new Error('This plugin has to be downloaded from its own site.')
  }

  const dir = addOnsDir(instancePath, serverType)
  await mkdir(dir, { recursive: true })

  const filename = version.filename ?? `${fallbackName.replace(/[^\w.-]+/g, '-')}.jar`
  const destination = join(dir, filename.endsWith('.jar') ? filename : `${filename}.jar`)

  await downloadFile(version.downloadUrl, destination, {
    onProgress,
    sha1: version.sha1 ?? undefined
  })

  return destination
}

export async function setPluginEnabled(
  instancePath: string,
  serverType: ServerType,
  filename: string,
  enabled: boolean
): Promise<void> {
  const dir = addOnsDir(instancePath, serverType)
  const current = join(dir, filename)
  if (!existsSync(current)) throw new Error(`Plugin not found: ${filename}`)

  const target = enabled
    ? join(dir, filename.replace(/\.disabled$/, ''))
    : join(dir, filename.endsWith('.disabled') ? filename : `${filename}.disabled`)

  if (current !== target) await rename(current, target)
}

export async function uninstallPlugin(
  instancePath: string,
  serverType: ServerType,
  filename: string
): Promise<void> {
  await rm(join(addOnsDir(instancePath, serverType), filename), { force: true })
}
