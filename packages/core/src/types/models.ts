import type { InstanceStatus, ServerType } from './index'

/**
 * The standardised platform models.
 *
 * Chunkforge started with a single `InstanceMetadata` record that conflated
 * four different things: who owns a server, what the server *is*, where it is
 * running, and what its process is doing right now. That was fine while
 * everything lived on one Windows machine. It stops working the moment a server
 * can move between hosts — "migrate this server to another node" is not
 * expressible if the server and its location are the same object.
 *
 * These types split them apart. `InstanceMetadata` remains the on-disk record
 * and is progressively stamped with the identifiers below, so existing installs
 * keep working while the platform grows into the shape.
 */

/** Ownership and permission boundary. Supersedes the old `ServerGroup`. */
export interface Project {
  id: string
  name: string
  /** Accent colour, carried over from server groups. */
  color: string
  createdAt: string
  /** Set on the single project that adopts servers with no explicit project. */
  isDefault?: boolean
}

/**
 * A host that can run servers.
 *
 * There are exactly two kinds, and the difference is how Chunkforge reaches
 * them. The `local` node is this machine, driven in-process. A `portal` node is
 * someone else's machine — a homelab box, a friend's Docker host — which
 * Chunkforge never connects to directly. It is reached by asking Portal to
 * forward the call down the socket that node already holds open, which is why
 * a remote node never needs a port opened on it.
 */
export interface Node {
  id: string
  name: string
  kind: 'local' | 'portal'
  /** Populated from the node's heartbeat; absent until it first reports. */
  stats?: NodeStats
  /** Last time the node was heard from, ISO-8601. */
  lastSeenAt?: string
  pairedAt?: string
  status: 'online' | 'offline'
  /** Portal's id for this node. Absent on the local node. */
  portalNodeId?: string
  /** Whether the node's embedded Core API is up and can take management calls. */
  agentReady?: boolean
  /** True once this control plane has claimed the node through Portal. */
  claimed?: boolean
  /** Another control plane on the same Portal already owns it. */
  /** @deprecated Nodes are shareable; always false. */
  claimedByOther?: boolean
  /** How many control planes have adopted this node, including this one. */
  claimantCount?: number
  /** Public routes Portal has opened for this node. */
  tunnels?: PortalTunnelPort[]
}

export interface NodeStats {
  cpuPercent: number
  cpuCores: number
  totalMemoryBytes: number
  usedMemoryBytes: number
  totalStorageBytes: number
  usedStorageBytes: number
  /** Round-trip time to the panel in milliseconds, used by the scheduler. */
  latencyMs?: number
}

export type TunnelProtocol = 'tcp' | 'udp'

/** One public route Portal has opened, as this control plane sees it. */
/**
 * What a network endpoint speaks.
 *
 * `http` is not simply "tcp with a hostname": Portal serves it by name on one
 * shared port rather than binding a port per service, so a map or a web
 * console costs a subdomain instead of a number players have to be told.
 */
export type EndpointProtocol = 'tcp' | 'udp' | 'http'

/**
 * One way into a server.
 *
 * A Minecraft server has stopped being a single port. Voice chat wants UDP,
 * a map wants HTTP, and a modpack may want several of each — so the port on
 * `InstanceMetadata` is now just the first of these rather than the whole
 * story.
 *
 * `localPort` is on the machine that runs the server; `publicPort` and
 * `hostname` are what Portal exposes. The split matters because the node
 * allocates the first and Portal allocates the second, and neither may assume
 * the other's answer.
 */
export interface ServerEndpoint {
  id: string
  /** What a person calls it: "Minecraft", "Voice Chat", "BlueMap". */
  label: string
  protocol: EndpointProtocol
  /** Port on the node. Allocated there when a caller does not pin one. */
  localPort: number
  /** Public port Portal accepts traffic on. Absent for http, which shares one. */
  publicPort?: number
  /** Hostname Portal serves this on. Only meaningful for http. */
  hostname?: string
  /**
   * What asked for this endpoint.
   *
   * `server` is the game port itself and cannot be removed; `addon` endpoints
   * are released when their add-on is uninstalled; `custom` ones are the
   * operator's own and are only ever removed by hand.
   */
  source: 'server' | 'addon' | 'custom'
  /** Which add-on declared it, when source is `addon`. */
  addonId?: string
  enabled: boolean
}

export interface PortalTunnelPort {
  id: string
  label: string
  protocol: TunnelProtocol
  /** Port on the node the server actually listens on. */
  targetPort: number
  /** Port Portal accepts player traffic on. */
  publicPort: number
  enabled: boolean
}

/** A subdomain Portal has allocated to one of this control plane's servers. */
export interface PortalDomainBinding {
  hostname: string
  nodeId: string
  instanceId?: string
  protocol: TunnelProtocol
  targetPort: number
  publicPort: number
  /** DNS the operator still has to publish, reported by Portal. */
  dnsRecords?: Array<{ type: string; name: string; value: string; note: string }>
}

/** The logical definition of a server, independent of where it runs. */
export interface Server {
  id: string
  projectId: string
  name: string
  serverType: ServerType
  minecraftVersion: string
  accentColor: string
  createdAt: string
}

/** A `Server` materialised on a `Node`: paths, process, allocated resources. */
export interface Instance {
  id: string
  serverId: string
  nodeId: string
  path: string
  port: number
  minRamMb: number
  maxRamMb: number
  status: InstanceStatus
}

/** Identifier of the node every install starts with — the local machine. */
export const LOCAL_NODE_ID = 'local'

/** Identifier of the project that adopts pre-existing servers on migration. */
export const DEFAULT_PROJECT_ID = 'default'
