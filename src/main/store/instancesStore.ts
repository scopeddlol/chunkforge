import { existsSync } from 'fs'
import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
import type { InstanceMetadata } from '../../shared/types'
import { instancesRoot } from '../services/paths'

const METADATA_FILENAME = 'chunkforge.instance.json'

export function slugifyInstanceName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const suffix = randomBytes(3).toString('hex')
  return `${slug || 'server'}-${suffix}`
}

export function instancePath(id: string): string {
  return join(instancesRoot(), id)
}

export async function saveInstanceMetadata(metadata: InstanceMetadata): Promise<void> {
  const dir = instancePath(metadata.id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, METADATA_FILENAME), JSON.stringify(metadata, null, 2), 'utf-8')
}

export async function loadInstanceMetadata(id: string): Promise<InstanceMetadata> {
  const raw = await readFile(join(instancePath(id), METADATA_FILENAME), 'utf-8')
  return JSON.parse(raw) as InstanceMetadata
}

export async function listInstanceMetadata(): Promise<InstanceMetadata[]> {
  const root = instancesRoot()
  if (!existsSync(root)) return []

  const entries = await readdir(root, { withFileTypes: true })
  const results: InstanceMetadata[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metadataPath = join(root, entry.name, METADATA_FILENAME)
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
