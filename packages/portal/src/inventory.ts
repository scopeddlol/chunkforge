import { portalRelay } from './relay'
import { portalStore } from './store'

/**
 * What every control plane on this Portal is running, gathered in one place.
 *
 * Portal already knew which *addresses* it had handed out, but not what
 * existed behind them — a server without a subdomain was invisible here, and
 * so was the name of one that had it. Asking each panel directly is what makes
 * an "everything, everywhere" view possible for an operator who runs more than
 * one panel against the same Portal.
 *
 * Panels are asked in parallel and each is reported on its own terms. A panel
 * that cannot be reached is *listed as unreachable* rather than left out:
 * omitting it looks exactly like a panel with no servers, and quietly showing
 * someone less than they have is worse than showing them a gap.
 */

/** One server, as the panel that owns it describes it. */
export interface InventoryServer {
  /** Unique across panels. Instance ids are slugified names and collide freely. */
  key: string
  instanceId: string
  name: string
  status?: string
  serverType?: string
  minecraftVersion?: string
  nodeId?: string | null
  playersOnline?: number
  portalHostname?: string | null
}

export interface InventoryClient {
  clientId: string
  name: string
  kind: string
  connected: boolean
  /** Absent when the panel could not be asked, or refused. */
  servers?: InventoryServer[]
  problem?: string
}

export interface PortalInventory {
  clients: InventoryClient[]
  serverCount: number
  unreachableCount: number
}

interface RawServer {
  id?: string
  name?: string
  status?: string
  serverType?: string
  minecraftVersion?: string
  nodeId?: string | null
  playersOnline?: number
  portalHostname?: string | null
}

export async function collectInventory(): Promise<PortalInventory> {
  const clients = portalStore.clients()

  const results = await Promise.all(
    clients.map(async (client): Promise<InventoryClient> => {
      const base = {
        clientId: client.id,
        name: client.name,
        kind: client.kind,
        connected: portalRelay.isClientConnected(client.id)
      }
      if (!base.connected) return { ...base, problem: 'Not connected to Portal right now.' }

      try {
        const response = await portalRelay.callClient(client.id, { method: 'GET', path: '/api/servers' })
        if (response.error) return { ...base, problem: response.error }
        if (response.status !== 200) {
          return { ...base, problem: `That control plane answered ${response.status}.` }
        }
        const parsed = JSON.parse(response.body ?? '[]') as RawServer[]
        return {
          ...base,
          servers: parsed
            .filter((server): server is RawServer & { id: string } => typeof server.id === 'string')
            .map((server) => ({
              // Two panels can each hold a server called "survival", so the id
              // alone is not a key. Without this they render as duplicates of
              // one another, or worse, collapse into one row.
              key: `${client.id}:${server.id}`,
              instanceId: server.id,
              name: server.name ?? server.id,
              status: server.status,
              serverType: server.serverType,
              minecraftVersion: server.minecraftVersion,
              nodeId: server.nodeId ?? null,
              playersOnline: server.playersOnline,
              portalHostname: server.portalHostname ?? null
            }))
        }
      } catch (err) {
        return { ...base, problem: (err as Error).message }
      }
    })
  )

  return {
    clients: results,
    serverCount: results.reduce((total, client) => total + (client.servers?.length ?? 0), 0),
    unreachableCount: results.filter((client) => client.servers === undefined).length
  }
}

/**
 * Domains that no longer point at a server anyone is running.
 *
 * Portal allocates a subdomain against an instance id and has, until now, had
 * no way to learn that the instance is gone: a control plane that is
 * uninstalled, a server deleted while its panel was offline, or a migration
 * that half-finished all leave a record behind. Those records keep a public
 * port bound and a DNS entry pointing at nothing.
 *
 * The inventory is what makes this answerable, and the rule is deliberately
 * conservative: a domain is only stale when the control plane that owns it
 * *answered* and did not list the instance. A panel that is offline, refused,
 * or errored proves nothing, and its domains are left alone — the cost of
 * keeping a dead record for another day is nothing, and the cost of deleting
 * a live one is a server nobody can reach.
 */
export interface StaleDomain {
  hostname: string
  clientId: string
  instanceId?: string
  reason: string
}

export async function findStaleDomains(): Promise<StaleDomain[]> {
  const inventory = await collectInventory()
  const answered = new Map<string, Set<string>>()
  for (const client of inventory.clients) {
    if (!client.servers) continue
    answered.set(client.clientId, new Set(client.servers.map((server) => server.instanceId)))
  }

  const stale: StaleDomain[] = []
  for (const domain of portalStore.domains()) {
    const known = answered.get(domain.clientId)
    // No answer from that control plane — say nothing about its domains.
    if (!known) continue
    // A domain with no instance id predates instance tracking; it cannot be
    // matched against an inventory, so it is never judged stale by this.
    if (!domain.instanceId) continue
    if (known.has(domain.instanceId)) continue
    stale.push({
      hostname: domain.hostname,
      clientId: domain.clientId,
      instanceId: domain.instanceId,
      reason: 'Its control plane no longer lists that server.'
    })
  }
  return stale
}
