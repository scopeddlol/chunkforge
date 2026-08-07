import { join } from 'path'
import { mkdir } from 'fs/promises'

/**
 * Where Chunkforge keeps instances, runtimes, and settings.
 *
 * The host decides this: the desktop app passes an Electron user path, the
 * standalone API reads it from config or an env var, and a node agent uses a
 * container volume. Core must not reach for Electron to find out.
 */
let dataRoot: string | null = null

export function configureDataRoot(root: string): void {
  dataRoot = root
}

export function chunkforgeRoot(): string {
  if (!dataRoot) {
    throw new Error(
      'Chunkforge data root is not configured — call configureDataRoot() during startup.'
    )
  }
  return dataRoot
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
