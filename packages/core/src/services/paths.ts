import { join } from 'path'
import { mkdir } from 'fs/promises'
import { networkInterfaces } from 'os'

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

/**
 * This machine's address on the local network, for servers that players reach
 * directly rather than through a Portal.
 *
 * Picks the first non-internal IPv4 interface. That is a guess on a host with
 * several NICs, but it is the right guess on the home and homelab networks
 * where a directly-reachable server lives at all, and it beats showing a bare
 * port the player has to pair with an address they were never told.
 */
export function localIpv4(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return null
}
