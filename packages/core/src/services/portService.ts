import { createServer } from 'net'
import { listInstanceMetadata } from '../store/instancesStore'

/**
 * Whether a port can actually be used, and finding one that can.
 *
 * Two different questions live here and they have different right answers:
 *
 *   - *Can I bind this right now?* Only the operating system knows, and the
 *     only honest way to ask is to try. Anything else — scanning a list of
 *     known instances, remembering what we started — misses every process on
 *     the machine that is not ours, which on a home server is most of them.
 *   - *Which port should a new server get?* Binding is necessary but not
 *     sufficient: a stopped Chunkforge server still owns its port, and handing
 *     it to a second server would work right up until someone started the
 *     first one again.
 *
 * So `isPortFree` asks the OS, `findFreePort` asks the OS *and* the instance
 * records, and callers pick the one that matches the question they have.
 */

/** Ports below this are privileged on Unix and a poor default for a game server. */
const MIN_PORT = 1024
const MAX_PORT = 65535

/**
 * Tries to bind the port, and reports whether that worked.
 *
 * Binds on all interfaces because that is what a Minecraft server does; a port
 * free on loopback but taken on the LAN address would otherwise look available
 * and then fail at launch.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
      resolve(false)
      return
    }
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => {
      probe.close(() => resolve(true))
    })
    // exclusive stops the probe from succeeding against a socket another
    // process opened with SO_REUSEADDR, which would report a taken port free.
    probe.listen({ port, host: '0.0.0.0', exclusive: true })
  })
}

/** Ports this machine's own servers have reserved, running or not. */
export async function portsReservedByInstances(excludeInstanceId?: string): Promise<Set<number>> {
  const all = await listInstanceMetadata().catch(() => [])
  return new Set(
    all.filter((instance) => instance.id !== excludeInstanceId).map((instance) => instance.port)
  )
}

export interface FreePortOptions {
  /** An instance whose own port should not count against it, when re-checking. */
  excludeInstanceId?: string
  /** How many ports to try past the preferred one before giving up. */
  span?: number
}

/**
 * Returns `preferred` when it is genuinely usable, otherwise the next port
 * that is — free on the machine *and* not already spoken for by another
 * Chunkforge server here.
 *
 * Walking upward from the preferred port rather than picking at random keeps
 * a machine's servers in a tidy, guessable block, which matters when someone
 * is forwarding ports by hand.
 */
export async function findFreePort(preferred: number, options: FreePortOptions = {}): Promise<number> {
  const { excludeInstanceId, span = 200 } = options
  const reserved = await portsReservedByInstances(excludeInstanceId)
  const start = Number.isInteger(preferred) && preferred >= MIN_PORT ? preferred : 25565

  for (let port = start; port < Math.min(start + span, MAX_PORT); port++) {
    if (reserved.has(port)) continue
    if (await isPortFree(port)) return port
  }
  throw new Error(
    `No free port found between ${start} and ${Math.min(start + span, MAX_PORT)}. Free one up, or pick a port yourself.`
  )
}

/** Why a port cannot be used, or null when it can. */
export async function portProblem(
  port: number,
  excludeInstanceId?: string
): Promise<string | null> {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return `Port ${port} is not a usable port number.`
  }
  const reserved = await portsReservedByInstances(excludeInstanceId)
  if (reserved.has(port)) {
    return `Port ${port} is already assigned to another server on this machine.`
  }
  if (!(await isPortFree(port))) {
    return `Port ${port} is already in use on this machine.`
  }
  return null
}
