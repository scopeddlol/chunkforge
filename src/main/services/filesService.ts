import { readdir, readFile, rename, rm, stat, writeFile, mkdir } from 'fs/promises'
import { join, resolve, relative, sep, extname } from 'path'
import type { FileEntry } from '../../shared/types'

const TEXT_EXTENSIONS = new Set([
  '.txt', '.properties', '.json', '.yml', '.yaml', '.toml', '.conf', '.cfg',
  '.log', '.md', '.ini', '.sh', '.bat', '.csv', '.xml', '.js', '.lang'
])

const MAX_EDITABLE_BYTES = 2 * 1024 * 1024

/**
 * Resolves a caller-supplied relative path inside the instance directory and
 * refuses anything that escapes it. The renderer is sandboxed but its input is
 * still untrusted, so every file operation goes through this.
 */
function safeResolve(instancePath: string, relativePath: string): string {
  const root = resolve(instancePath)
  const target = resolve(root, relativePath || '.')
  const rel = relative(root, target)
  if (rel.startsWith('..') || (rel !== '' && rel.split(sep)[0] === '..')) {
    throw new Error('Path is outside the server folder')
  }
  return target
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

export async function listDirectory(instancePath: string, relativePath: string): Promise<FileEntry[]> {
  const dir = safeResolve(instancePath, relativePath)
  const entries = await readdir(dir, { withFileTypes: true })

  const results = await Promise.all(
    entries.map(async (entry): Promise<FileEntry> => {
      const absolute = join(dir, entry.name)
      const info = await stat(absolute).catch(() => null)
      const isDirectory = entry.isDirectory()
      const size = info?.size ?? 0
      return {
        name: entry.name,
        relativePath: toPosix(relative(resolve(instancePath), absolute)),
        isDirectory,
        sizeBytes: size,
        modifiedAt: info?.mtimeMs ?? 0,
        editable:
          !isDirectory && size <= MAX_EDITABLE_BYTES && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())
      }
    })
  )

  // Folders first, then alphabetical — matches what people expect from a file list.
  return results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function readTextFile(instancePath: string, relativePath: string): Promise<string> {
  const target = safeResolve(instancePath, relativePath)
  const info = await stat(target)
  if (info.size > MAX_EDITABLE_BYTES) throw new Error('File is too large to open in the editor')
  return readFile(target, 'utf-8')
}

export async function writeTextFile(
  instancePath: string,
  relativePath: string,
  contents: string
): Promise<void> {
  await writeFile(safeResolve(instancePath, relativePath), contents, 'utf-8')
}

export async function deleteEntry(instancePath: string, relativePath: string): Promise<void> {
  const target = safeResolve(instancePath, relativePath)
  if (target === resolve(instancePath)) throw new Error('Refusing to delete the server root')
  await rm(target, { recursive: true, force: true })
}

export async function renameEntry(
  instancePath: string,
  relativePath: string,
  newName: string
): Promise<void> {
  if (newName.includes('/') || newName.includes('\\')) throw new Error('Name cannot contain path separators')
  const target = safeResolve(instancePath, relativePath)
  const parent = resolve(target, '..')
  await rename(target, join(parent, newName))
}

export async function createDirectory(instancePath: string, relativePath: string): Promise<void> {
  await mkdir(safeResolve(instancePath, relativePath), { recursive: true })
}
