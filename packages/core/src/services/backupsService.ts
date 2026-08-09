import { existsSync } from 'fs'
import { mkdir, readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { defaultBackupContents, type BackupContents, type BackupEntry } from '../types/index'

const BACKUPS_DIRNAME = 'chunkforge-backups'
// Everything a world needs; the nether/end live in sibling folders on servers.
const WORLD_DIRS = ['world', 'world_nether', 'world_the_end']
/** Where add-ons live, across the loaders Chunkforge supports. */
const ADDON_DIRS = ['plugins', 'mods']
/**
 * The loader-agnostic set of files someone would be upset to retype.
 *
 * Directories and plain files are handled separately below because a zip needs
 * to be told which it is being given.
 */
const CONFIG_DIRS = ['config', 'defaultconfigs']
const CONFIG_FILES = [
  'server.properties',
  'bukkit.yml',
  'spigot.yml',
  'paper.yml',
  'paper-global.yml',
  'paper-world-defaults.yml',
  'purpur.yml',
  'ops.json',
  'whitelist.json',
  'banned-players.json',
  'banned-ips.json',
  'permissions.yml'
]

/**
 * A record of what an archive holds, written inside it.
 *
 * Without this a restore has to guess, and guessing wrong is destructive: the
 * only safe way to replace a world is to delete the old one first, so a
 * restore that assumed "this contains worlds" about a configs-only archive
 * would delete a world it then had nothing to put back.
 */
const MANIFEST_NAME = 'chunkforge-backup.json'

interface BackupManifest {
  contents: BackupContents
  createdAt: string
}

function readManifest(archivePath: string): BackupManifest | null {
  try {
    const entry = new AdmZip(archivePath).getEntry(MANIFEST_NAME)
    if (!entry) return null
    return JSON.parse(entry.getData().toString('utf-8')) as BackupManifest
  } catch {
    return null
  }
}

/**
 * What an archive holds, for archives that predate the manifest.
 *
 * Everything Chunkforge wrote before this was worlds and nothing else, so that
 * is the only safe assumption — and it happens to be the correct one.
 */
const LEGACY_CONTENTS: BackupContents = { worlds: true, addons: false, configs: false }

function backupsDir(instancePath: string): string {
  return join(instancePath, BACKUPS_DIRNAME)
}

export async function listBackups(instancePath: string): Promise<BackupEntry[]> {
  const dir = backupsDir(instancePath)
  if (!existsSync(dir)) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const backups: BackupEntry[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.zip')) continue
    const info = await stat(join(dir, entry.name))
    backups.push({
      filename: entry.name,
      sizeBytes: info.size,
      createdAt: info.mtimeMs,
      contents: readManifest(join(dir, entry.name))?.contents ?? LEGACY_CONTENTS
    })
  }

  return backups.sort((a, b) => b.createdAt - a.createdAt)
}

export async function createBackup(
  instancePath: string,
  contents: BackupContents = defaultBackupContents
): Promise<BackupEntry> {
  const dir = backupsDir(instancePath)
  await mkdir(dir, { recursive: true })

  const zip = new AdmZip()
  let included = 0

  const addFolder = (name: string): void => {
    const source = join(instancePath, name)
    if (!existsSync(source)) return
    zip.addLocalFolder(source, name)
    included++
  }

  if (contents.worlds) WORLD_DIRS.forEach(addFolder)
  if (contents.addons) ADDON_DIRS.forEach(addFolder)
  if (contents.configs) {
    CONFIG_DIRS.forEach(addFolder)
    for (const name of CONFIG_FILES) {
      const source = join(instancePath, name)
      if (!existsSync(source)) continue
      zip.addLocalFile(source)
      included++
    }
  }

  if (included === 0) {
    // Naming what was asked for beats a generic "nothing to back up", since the
    // usual cause is a selection that does not match this server yet.
    const asked = describeContents(contents)
    throw new Error(
      `Nothing to back up: this server has no ${asked} yet. Start it once, or include something else.`
    )
  }

  // Written last so it describes what actually went in.
  zip.addFile(
    MANIFEST_NAME,
    Buffer.from(JSON.stringify({ contents, createdAt: new Date().toISOString() }, null, 2), 'utf-8')
  )

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `${archivePrefix(contents)}-${stamp}.zip`
  zip.writeZip(join(dir, filename))

  const info = await stat(join(dir, filename))
  return { filename, sizeBytes: info.size, createdAt: info.mtimeMs, contents }
}

/** A filename that says at a glance what is inside. */
function archivePrefix(contents: BackupContents): string {
  const parts: string[] = []
  if (contents.worlds) parts.push('world')
  if (contents.addons) parts.push('addons')
  if (contents.configs) parts.push('configs')
  return parts.join('-') || 'backup'
}

function describeContents(contents: BackupContents): string {
  const parts: string[] = []
  if (contents.worlds) parts.push('world folders')
  if (contents.addons) parts.push('plugins or mods')
  if (contents.configs) parts.push('config files')
  if (parts.length === 0) return 'content selected'
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`
}

export async function restoreBackup(instancePath: string, filename: string): Promise<void> {
  const archivePath = join(backupsDir(instancePath), filename)
  if (!existsSync(archivePath)) throw new Error(`Backup not found: ${filename}`)

  const contents = readManifest(archivePath)?.contents ?? LEGACY_CONTENTS

  /**
   * Only what the archive can put back is cleared first.
   *
   * Clearing is necessary — extracting over a world leaves a mix of old and
   * new chunk files, which is its own kind of corruption — but it must be
   * limited to the categories this archive actually holds. Wiping the worlds
   * to restore a configs-only backup would delete the one thing nobody can
   * regenerate, in the name of putting back a file that fits in a tweet.
   */
  if (contents.worlds) {
    for (const worldDir of WORLD_DIRS) {
      await rm(join(instancePath, worldDir), { recursive: true, force: true })
    }
  }
  if (contents.addons) {
    for (const addonDir of ADDON_DIRS) {
      await rm(join(instancePath, addonDir), { recursive: true, force: true })
    }
  }
  // Config files are overwritten in place rather than cleared: they are
  // individual files, extracting replaces each one, and deleting the folder
  // first would take unrelated files with it.

  const zip = new AdmZip(archivePath)
  zip.extractAllTo(instancePath, true)
  // The manifest is bookkeeping, not part of the server.
  await rm(join(instancePath, MANIFEST_NAME), { force: true })
}

export async function deleteBackup(instancePath: string, filename: string): Promise<void> {
  await rm(join(backupsDir(instancePath), filename), { force: true })
}
