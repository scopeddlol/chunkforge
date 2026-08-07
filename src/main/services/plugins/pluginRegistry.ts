import { existsSync } from 'fs'
import { mkdir, readdir, rename, rm, stat } from 'fs/promises'
import { join } from 'path'
import type {
  InstalledPlugin,
  PluginSearchQuery,
  PluginSearchResponse,
  PluginSource,
  PluginVersion
} from '../../../shared/types'
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
        const results = await provider.search(query.query, query.gameVersion, limit)
        return { source, error: null, results }
      } catch (err) {
        return { source, error: (err as Error).message, results: [] }
      }
    })
  )

  // Interleave sources so no single one dominates the top of the grid.
  const buckets = settled.map((s) => s.results)
  const results: PluginSearchResponse['results'] = []
  const maxLen = Math.max(0, ...buckets.map((b) => b.length))
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (bucket[i]) results.push(bucket[i])
    }
  }

  return {
    results,
    errors: settled
      .filter((s) => s.error !== null)
      .map((s) => ({ source: s.source, message: s.error as string }))
  }
}

export async function listPluginVersions(source: PluginSource, projectId: string): Promise<PluginVersion[]> {
  return providers[source].listVersions(projectId)
}

function pluginsDir(instancePath: string): string {
  return join(instancePath, 'plugins')
}

export async function listInstalledPlugins(instancePath: string): Promise<InstalledPlugin[]> {
  const dir = pluginsDir(instancePath)
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
  version: PluginVersion,
  fallbackName: string,
  onProgress?: (percent: number | null) => void
): Promise<string> {
  if (!version.downloadUrl) {
    throw new Error('This plugin has to be downloaded from its own site.')
  }

  const dir = pluginsDir(instancePath)
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
  filename: string,
  enabled: boolean
): Promise<void> {
  const dir = pluginsDir(instancePath)
  const current = join(dir, filename)
  if (!existsSync(current)) throw new Error(`Plugin not found: ${filename}`)

  const target = enabled
    ? join(dir, filename.replace(/\.disabled$/, ''))
    : join(dir, filename.endsWith('.disabled') ? filename : `${filename}.disabled`)

  if (current !== target) await rename(current, target)
}

export async function uninstallPlugin(instancePath: string, filename: string): Promise<void> {
  await rm(join(pluginsDir(instancePath), filename), { force: true })
}
