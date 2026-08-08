import type { InstanceSummary } from '@shared/types'

/**
 * What to tell a player to connect to.
 *
 * A Portal subdomain always wins when one exists: it is the address that keeps
 * working when the server moves node or the host's LAN address changes, and
 * for a server on a node it is the *only* reachable address, since nodes hold
 * no inbound ports of their own. Without one, a server on this machine is
 * reachable directly, and a server on a node simply has no address to show yet
 * — saying so is better than printing a port nobody can connect to.
 */
export type ServerAddress =
  | { kind: 'portal'; value: string }
  | { kind: 'direct'; value: string }
  | { kind: 'none' }

export function resolveServerAddress(
  instance: Pick<
    InstanceSummary,
    'portalHostname' | 'portalPublicPort' | 'directAddress' | 'nodeId'
  > & { port?: number }
): ServerAddress {
  if (instance.portalHostname) {
    const port = instance.portalPublicPort
    return { kind: 'portal', value: port ? `${instance.portalHostname}:${port}` : instance.portalHostname }
  }

  const isRemote = Boolean(instance.nodeId && instance.nodeId !== 'local')
  if (isRemote) return { kind: 'none' }

  if (instance.directAddress) return { kind: 'direct', value: instance.directAddress }
  return instance.port ? { kind: 'direct', value: `localhost:${instance.port}` } : { kind: 'none' }
}
