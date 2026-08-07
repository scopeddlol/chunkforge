/**
 * Chunkforge Portal's own domain model.
 *
 * Portal is deliberately *not* a Chunkforge control plane. It never creates a
 * Minecraft server, never touches an instance directory, and knows nothing
 * about jars, mods, or backups. It manages three things:
 *
 *   1. **Subdomains** — a DNS zone it hands labels out of, each bound to a
 *      public port on a node.
 *   2. **Proxying** — the public TCP/UDP listeners those subdomains resolve to,
 *      forwarded to the node that actually runs the server.
 *   3. **Pairing** — the pins that let a node, or a Chunkforge control plane
 *      (Desktop or Web), attach to this Portal.
 *
 * Everything else — the server wizard, the console, add-ons — belongs to the
 * Chunkforge UI, which reaches its nodes *through* Portal rather than living
 * inside it.
 */

export type TunnelProtocol = 'tcp' | 'udp'

/** Which kind of thing a pin invites. */
export type PairingKind = 'node' | 'client'

/** A Chunkforge control plane attached to this Portal. */
export type ClientKind = 'desktop' | 'web'

/** A Docker node worker paired into this Portal. */
export interface PortalNode {
  id: string
  name: string
  /** Only the hash is retained; the plaintext token is shown once at pairing. */
  tokenHash: string
  status: 'online' | 'offline'
  pairedAt: string
  lastSeenAt?: string
  stats?: PortalNodeStats
  /** Ports the node has told Portal it can accept traffic on. */
  tunnels: PortalTunnel[]
  /**
   * The control plane that has adopted this node. Until one does, the node is
   * reachable but unmanaged — Portal will proxy for it but nothing is driving
   * it.
   */
  claimedByClientId?: string
  /** Set once the node reports that its embedded Core API is up. */
  agentReady?: boolean
}

export interface PortalNodeStats {
  cpuPercent: number
  cpuCores: number
  totalMemoryBytes: number
  usedMemoryBytes: number
  totalStorageBytes: number
  usedStorageBytes: number
  latencyMs?: number
}

/** One forwarded port on a node. */
export interface PortalTunnel {
  id: string
  label: string
  protocol: TunnelProtocol
  /** Where the real service listens, on the node. */
  targetPort: number
  /** Where Portal listens publicly. Assigned by Portal when auto-allocating. */
  publicPort: number
  enabled: boolean
}

/** A Chunkforge Desktop or Chunkforge Web attached to this Portal. */
export interface PortalClientRecord {
  id: string
  name: string
  kind: ClientKind
  tokenHash: string
  pairedAt: string
  lastSeenAt?: string
}

/** A subdomain Portal has handed out, and what it points at. */
export interface PortalDomain {
  /** Full hostname, e.g. `survival.play.example.com`. */
  hostname: string
  /** The label alone, e.g. `survival`. */
  label: string
  nodeId: string
  /** The control plane that asked for it. */
  clientId: string
  /** The instance id on that control plane, so it can map the record back. */
  instanceId?: string
  protocol: TunnelProtocol
  /** Port on the node the traffic ends up at. */
  targetPort: number
  /** Public port Portal accepts traffic on for this hostname. */
  publicPort: number
  createdAt: string
}

/** A short-lived pairing code. */
export interface PortalPin {
  code: string
  kind: PairingKind
  label?: string
  createdAt: string
  expiresAt: string
  usedAt?: string
}

export interface PortalConfig {
  /** How clients and nodes reach this Portal, e.g. `https://portal.example.com`. */
  publicBaseUrl: string
  /** DNS zone subdomains are allocated under, e.g. `play.example.com`. */
  zoneSuffix: string
  /** Inclusive public port range Portal may bind for allocated routes. */
  publicPortRangeStart: number
  publicPortRangeEnd: number
  /**
   * When true a domain allocation picks its own public port from the range.
   * When false the caller must name a port, which is what you want if the
   * zone's DNS uses SRV records or a single well-known port per host.
   */
  autoAllocatePorts: boolean
  trustProxy: boolean
}

export const defaultPortalConfig: PortalConfig = {
  publicBaseUrl: '',
  zoneSuffix: '',
  publicPortRangeStart: 25600,
  publicPortRangeEnd: 25699,
  autoAllocatePorts: true,
  trustProxy: true
}

/** What the admin UI renders on its landing page. */
export interface PortalOverview {
  config: PortalConfig
  nodeCount: number
  onlineNodeCount: number
  clientCount: number
  domainCount: number
  activeTunnelCount: number
  uptimeSeconds: number
  version: string
}

/** The node view a control plane sees over `/api/client/nodes`. */
export interface PortalNodeView {
  id: string
  name: string
  status: PortalNode['status']
  lastSeenAt?: string
  pairedAt: string
  stats?: PortalNodeStats
  tunnels: PortalTunnel[]
  agentReady: boolean
  /** True when *this* client owns the node; false when another one does. */
  claimed: boolean
  claimedByOther: boolean
}
