import { existsSync } from 'fs'
import { mkdir, readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import AdmZip from 'adm-zip'
import type { BackupEntry } from '../types/index'

const BACKUPS_DIRNAME = 'chunkforge-backups'
// Everything a world needs; the nether/end live in sibling folders on servers.
const WORLD_DIRS = ['world', 'world_nether', 'world_the_end']

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
    backups.push({ filename: entry.name, sizeBytes: info.size, createdAt: info.mtimeMs })
  }

  return backups.sort((a, b) => b.createdAt - a.createdAt)
}

export async function createBackup(instancePath: string): Promise<BackupEntry> {
  const dir = backupsDir(instancePath)
  await mkdir(dir, { recursive: true })

  const zip = new AdmZip()
  let included = 0
  for (const worldDir of WORLD_DIRS) {
    const source = join(instancePath, worldDir)
    if (!existsSync(source)) continue
    zip.addLocalFolder(source, worldDir)
    included++
  }

  if (included === 0) {
    throw new Error('No world folders found yet — start the server once to generate the world.')
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `world-${stamp}.zip`
  zip.writeZip(join(dir, filename))

  const info = await stat(join(dir, filename))
  return { filename, sizeBytes: info.size, createdAt: info.mtimeMs }
}

export async function restoreBackup(instancePath: string, filename: string): Promise<void> {
  const archivePath = join(backupsDir(instancePath), filename)
  if (!existsSync(archivePath)) throw new Error(`Backup not found: ${filename}`)

  // Clear the existing worlds first so restoring can't leave a mix of old and
  // new chunk files behind.
  for (const worldDir of WORLD_DIRS) {
    await rm(join(instancePath, worldDir), { recursive: true, force: true })
  }

  new AdmZip(archivePath).extractAllTo(instancePath, true)
}

export async function deleteBackup(instancePath: string, filename: string): Promise<void> {
  await rm(join(backupsDir(instancePath), filename), { force: true })
}
