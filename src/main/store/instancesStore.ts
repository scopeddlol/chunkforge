import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type { InstanceMetadata } from '../../shared/types'
import { chunkforgeRoot, instancesRoot } from '../services/paths'

const METADATA_FILENAME = 'chunkforge.instance.json'
const INDEX_FILENAME = 'instances-index.json'

interface IndexEntry {
  id: string
  path: string
}

function indexFilePath(): string {
  return join(chunkforgeRoot(), INDEX_FILENAME)
}

async function readIndex(): Promise<IndexEntry[]> {
  const filePath = indexFilePath()
  if (!existsSync(filePath)) return []
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as IndexEntry[]
  } catch {
    return []
  }
}

async function writeIndex(entries: IndexEntry[]): Promise<void> {
  await mkdir(chunkforgeRoot(), { recursive: true })
  await writeFile(indexFilePath(), JSON.stringify(entries, null, 2), 'utf-8')
}

async function upsertIndexEntry(entry: IndexEntry): Promise<void> {
  const entries = await readIndex()
  const next = entries.filter((e) => e.id !== entry.id)
  next.push(entry)
  await writeIndex(next)
}

export function slugifyInstanceName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const suffix = randomBytes(3).toString('hex')
  return `${slug || 'server'}-${suffix}`
}

/** Resolves where an instance's folder should live: a custom parent directory if given, else the default Instances root. */
export function resolveInstanceDir(id: string, installLocation: string | null): string {
  return join(installLocation && installLocation.trim() ? installLocation : instancesRoot(), id)
}

export async function saveInstanceMetadata(metadata: InstanceMetadata): Promise<void> {
  await mkdir(metadata.path, { recursive: true })
  await writeFile(join(metadata.path, METADATA_FILENAME), JSON.stringify(metadata, null, 2), 'utf-8')
  await upsertIndexEntry({ id: metadata.id, path: metadata.path })
}

export async function loadInstanceMetadata(id: string): Promise<InstanceMetadata> {
  const entries = await readIndex()
  const entry = entries.find((e) => e.id === id)
  if (!entry) throw new Error(`Unknown instance: ${id}`)
  const raw = await readFile(join(entry.path, METADATA_FILENAME), 'utf-8')
  return JSON.parse(raw) as InstanceMetadata
}

export async function listInstanceMetadata(): Promise<InstanceMetadata[]> {
  const entries = await readIndex()
  const results: InstanceMetadata[] = []

  for (const entry of entries) {
    const metadataPath = join(entry.path, METADATA_FILENAME)
    if (!existsSync(metadataPath)) continue
    try {
      const raw = await readFile(metadataPath, 'utf-8')
      const metadata = JSON.parse(raw) as InstanceMetadata
      // Nothing survives an app restart running, so instances always come
      // back in a known-stopped state rather than trusting stale state on disk.
      results.push({ ...metadata, status: 'stopped', playersOnline: 0 })
    } catch {
      // Skip unreadable/corrupt instance metadata rather than failing the whole list.
    }
  }

  return results
}
