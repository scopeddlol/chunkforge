import { app } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'

export function chunkforgeRoot(): string {
  return join(app.getPath('documents'), 'Chunkforge')
}

export function instancesRoot(): string {
  return join(chunkforgeRoot(), 'Instances')
}

export function runtimesRoot(): string {
  return join(chunkforgeRoot(), 'Runtimes')
}

export function cacheRoot(): string {
  return join(chunkforgeRoot(), 'Cache')
}

export async function ensureChunkforgeDirs(): Promise<void> {
  await mkdir(instancesRoot(), { recursive: true })
  await mkdir(runtimesRoot(), { recursive: true })
  await mkdir(cacheRoot(), { recursive: true })
}
