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

/** A host that can run servers. The desktop app is itself a node. */
export interface Node {
  id: string
  name: string
  /**
   * `local` is the in-process runner the desktop and standalone panel use;
   * `remote` is a paired container reached over the Portal relay.
   */
  kind: 'local' | 'remote'
  /** Populated from the node's heartbeat; absent until it first reports. */
  stats?: NodeStats
  /** Last time the node was heard from, ISO-8601. */
  lastSeenAt?: string
  pairedAt?: string
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
