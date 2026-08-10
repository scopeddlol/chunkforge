import { existsSync } from 'fs'
import { mkdir, mkdtemp, readdir, rm, rename } from 'fs/promises'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import AdmZip from 'adm-zip'
import { contentFolder, type ContentKind, type PluginVersion } from '../../types/index'
import { downloadFile } from '../downloadFile'

/**
 * Installing the things that are not code.
 *
 * Worlds, datapacks and resource packs all arrive as a zip and all go
 * somewhere different, and one of them replaces the server's save. Keeping
 * them out of `installPlugin` is deliberate: that function's job is to drop a
 * jar in a folder, and a world install that quietly deleted a world by taking
 * the same path would be the worst bug in this project.
 */

export interface ContentInstallResult {
  path: string
  /** Set when an existing world was moved aside rather than deleted. */
  replacedBackupPath?: string
}

export interface ContentInstallOptions {
  onProgress?: (percent: number | null) => void
  /** The server's `level-name`, since datapacks and worlds are per-save. */
  levelName?: string
  /**
   * Required to install a world.
   *
   * A world install replaces the save every player on the server is standing
   * in. It is the one content operation that destroys something, so it cannot
   * happen as a side effect of a click that looked like every other install.
   */
  replaceExistingWorld?: boolean
}

export async function installContent(
  instancePath: string,
  kind: ContentKind,
  version: PluginVersion,
  fallbackName: string,
  options: ContentInstallOptions = {}
): Promise<ContentInstallResult> {
  if (!version.downloadUrl) {
    throw new Error('This has to be downloaded from its own site.')
  }
  const levelName = options.levelName || 'world'
  const folder = contentFolder(kind, levelName)
  if (!folder) throw new Error(`${kind} is not installed this way.`)

  if (kind === 'world') {
    return installWorld(instancePath, levelName, version, options)
  }

  // Datapacks and resource packs are read as zips in place — Minecraft
  // unpacks them itself, and unpacking them here would break the ones that
  // rely on being a single file.
  const destinationDir = join(instancePath, folder)
  await mkdir(destinationDir, { recursive: true })
  const filename = safeName(version.filename ?? `${fallbackName}.zip`)
  const destination = join(destinationDir, filename)

  await downloadFile(version.downloadUrl, destination, {
    onProgress: options.onProgress,
    sha1: version.sha1 ?? undefined
  })
  return { path: destination }
}

/**
 * Replaces the server's world with a downloaded one.
 *
 * The existing world is renamed rather than deleted. Downloading a map and
 * losing a year of building to it is not a recoverable mistake, and a rename
 * costs nothing on the same filesystem — the old save sits beside the new one
 * until somebody decides otherwise.
 */
async function installWorld(
  instancePath: string,
  levelName: string,
  version: PluginVersion,
  options: ContentInstallOptions
): Promise<ContentInstallResult> {
  if (!options.replaceExistingWorld) {
    throw new Error(
      'Installing a world replaces the current one. Confirm the replacement to continue.'
    )
  }

  const staging = await mkdtemp(join(tmpdir(), 'chunkforge-world-'))
  try {
    const archive = join(staging, 'world.zip')
    await downloadFile(version.downloadUrl as string, archive, {
      onProgress: options.onProgress,
      sha1: version.sha1 ?? undefined
    })

    const unpacked = join(staging, 'unpacked')
    await mkdir(unpacked, { recursive: true })
    new AdmZip(archive).extractAllTo(unpacked, true)

    /**
     * World archives are packed inconsistently: some hold `level.dat` at the
     * root, most wrap it in a folder named after the map. Finding the folder
     * that actually contains a `level.dat` is the only reliable way to know
     * what to install, and a zip without one is not a world at all.
     */
    const root = await findWorldRoot(unpacked)
    if (!root) {
      throw new Error('That archive does not contain a Minecraft world (no level.dat found).')
    }

    const target = join(instancePath, levelName)
    let replacedBackupPath: string | undefined
    if (existsSync(target)) {
      replacedBackupPath = `${target}.replaced-${Date.now()}`
      await rename(target, replacedBackupPath)
    }

    await mkdir(dirname(target), { recursive: true })
    await rename(root, target)
    return { path: target, replacedBackupPath }
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** The folder holding `level.dat`, searched a couple of levels deep. */
async function findWorldRoot(dir: string, depth = 0): Promise<string | null> {
  if (depth > 2) return null
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  if (entries.some((e) => e.isFile() && e.name === 'level.dat')) return dir
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const found = await findWorldRoot(join(dir, entry.name), depth + 1)
    if (found) return found
  }
  return null
}

/** Keeps a downloaded name from escaping the folder it belongs in. */
function safeName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'download.zip'
  return base.replace(/[^\w.\-+ ]+/g, '_')
}
