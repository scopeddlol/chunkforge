import { mkdir, rm } from 'fs/promises'
import { join, dirname, normalize, sep, isAbsolute } from 'path'
import AdmZip from 'adm-zip'
import type { ModpackInstallProgress, PluginSource, ServerType } from '../types/index'
import { downloadFile } from './downloadFile'
import { cacheRoot } from './paths'
import { fetchJson } from './plugins/provider'
import { getSettings } from '../store/settingsStore'

/**
 * A Modrinth .mrpack is a zip holding modrinth.index.json plus an overrides/
 * tree that is copied over the server directory.
 */
interface MrpackIndex {
  formatVersion: number
  name: string
  versionId: string
  dependencies: Record<string, string>
  files: Array<{
    path: string
    downloads: string[]
    hashes?: { sha1?: string }
    env?: { client?: string; server?: string }
  }>
}

/** CurseForge packs ship a manifest listing project/file id pairs to resolve. */
interface CurseForgeManifest {
  name: string
  minecraft: { version: string; modLoaders: Array<{ id: string; primary?: boolean }> }
  files: Array<{ projectID: number; fileID: number; required?: boolean }>
  overrides?: string
}

export interface ModpackTarget {
  serverType: ServerType
  minecraftVersion: string
}

function safeJoin(root: string, relative: string): string {
  // Archive entries are untrusted; refuse anything escaping the server folder.
  const normalized = normalize(relative).replace(/^([/\\])+/, '')
  if (isAbsolute(normalized) || normalized.split(sep).includes('..')) {
    throw new Error(`Refusing unsafe path in modpack: ${relative}`)
  }
  return join(root, normalized)
}

/** Maps a modpack's declared loader to a Chunkforge server type. */
export function loaderToServerType(dependencies: Record<string, string>): ServerType | null {
  if (dependencies['fabric-loader']) return 'fabric'
  if (dependencies['neoforge']) return 'neoforge'
  if (dependencies['forge']) return 'forge'
  if (dependencies['quilt-loader']) return null
  return null
}

export async function readModpackTarget(source: PluginSource, downloadUrl: string): Promise<ModpackTarget> {
  const archivePath = await stageArchive(downloadUrl, 'target')
  try {
    if (source === 'modrinth') {
      const index = readMrpackIndex(archivePath)
      const serverType = loaderToServerType(index.dependencies)
      if (!serverType) throw new Error('This modpack uses a loader Chunkforge does not support yet')
      return { serverType, minecraftVersion: index.dependencies.minecraft }
    }
    const manifest = readCurseForgeManifest(archivePath)
    const primary = manifest.minecraft.modLoaders.find((l) => l.primary) ?? manifest.minecraft.modLoaders[0]
    const id = primary?.id ?? ''
    const serverType: ServerType = id.startsWith('neoforge')
      ? 'neoforge'
      : id.startsWith('fabric')
        ? 'fabric'
        : 'forge'
    return { serverType, minecraftVersion: manifest.minecraft.version }
  } finally {
    await rm(archivePath, { force: true })
  }
}

async function stageArchive(downloadUrl: string, label: string): Promise<string> {
  const dir = join(cacheRoot(), 'modpacks')
  await mkdir(dir, { recursive: true })
  const archivePath = join(dir, `${label}-${Date.now()}.zip`)
  await downloadFile(downloadUrl, archivePath)
  return archivePath
}

function readMrpackIndex(archivePath: string): MrpackIndex {
  const entry = new AdmZip(archivePath).getEntry('modrinth.index.json')
  if (!entry) throw new Error('Not a valid .mrpack — modrinth.index.json is missing')
  return JSON.parse(entry.getData().toString('utf-8')) as MrpackIndex
}

function readCurseForgeManifest(archivePath: string): CurseForgeManifest {
  const entry = new AdmZip(archivePath).getEntry('manifest.json')
  if (!entry) throw new Error('Not a valid CurseForge pack — manifest.json is missing')
  return JSON.parse(entry.getData().toString('utf-8')) as CurseForgeManifest
}

function extractOverrides(archivePath: string, destDir: string, folder: string): void {
  const zip = new AdmZip(archivePath)
  const prefix = `${folder}/`
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue
    const target = safeJoin(destDir, entry.entryName.slice(prefix.length))
    zip.extractEntryTo(entry, dirname(target), false, true, false, target.split(sep).pop())
  }
}

/**
 * Installs a modpack's mods into an existing server directory. Client-only
 * entries are skipped — installing them server-side breaks the server.
 */
export async function installModpack(
  source: PluginSource,
  downloadUrl: string,
  destDir: string,
  onProgress: (progress: ModpackInstallProgress) => void
): Promise<void> {
  onProgress({ stage: 'downloading', message: 'Downloading modpack…', percent: 0 })
  const archivePath = await stageArchive(downloadUrl, 'install')

  try {
    if (source === 'modrinth') {
      const index = readMrpackIndex(archivePath)
      const serverFiles = index.files.filter((f) => f.env?.server !== 'unsupported')

      for (const [i, file] of serverFiles.entries()) {
        const url = file.downloads[0]
        if (!url) continue
        onProgress({
          stage: 'installing',
          message: `Installing ${file.path.split('/').pop()} (${i + 1}/${serverFiles.length})`,
          percent: Math.round((i / serverFiles.length) * 100)
        })
        const target = safeJoin(destDir, file.path)
        await mkdir(dirname(target), { recursive: true })
        await downloadFile(url, target, { sha1: file.hashes?.sha1 })
      }

      onProgress({ stage: 'installing', message: 'Applying pack config files…', percent: 100 })
      extractOverrides(archivePath, destDir, 'overrides')
      extractOverrides(archivePath, destDir, 'server-overrides')
    } else {
      const manifest = readCurseForgeManifest(archivePath)
      const apiKey = getSettings().curseForgeApiKey?.trim()
      if (!apiKey) throw new Error('A CurseForge API key is required to install CurseForge packs')

      const modsDir = join(destDir, 'mods')
      await mkdir(modsDir, { recursive: true })

      for (const [i, file] of manifest.files.entries()) {
        onProgress({
          stage: 'installing',
          message: `Installing mod ${i + 1} of ${manifest.files.length}`,
          percent: Math.round((i / manifest.files.length) * 100)
        })
        try {
          const detail = await fetchJson<{ data: { fileName: string; downloadUrl: string | null } }>(
            `https://api.curseforge.com/v1/mods/${file.projectID}/files/${file.fileID}`,
            { headers: { 'x-api-key': apiKey } }
          )
          const { downloadUrl: modUrl, fileName } = detail.data
          // Some authors opt out of third-party distribution; skip rather than fail.
          if (!modUrl) continue
          await downloadFile(modUrl, join(modsDir, fileName))
        } catch {
          // A single unavailable mod shouldn't abort the whole pack.
        }
      }

      extractOverrides(archivePath, destDir, manifest.overrides ?? 'overrides')
    }

    onProgress({ stage: 'done', message: 'Modpack installed.', percent: 100 })
  } finally {
    await rm(archivePath, { force: true })
  }
}
