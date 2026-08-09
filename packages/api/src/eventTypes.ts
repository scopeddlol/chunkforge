import type {
  BackupUploadProgress,
  CreateProgressEvent,
  LogLineEvent,
  ModpackInstallProgress,
  Node,
  PortalSettings,
  PlayersChangedEvent,
  StatusChangedEvent
} from '@chunkforge/core'

/**
 * The live event contract, kept in its own module with no runtime imports.
 *
 * The client bundles into a browser and the server runs on Node, but both must
 * agree on these shapes. Anything importing the server's `events.ts` would drag
 * in Fastify and the instance manager, so the types live here on their own.
 */
export interface ServerEventPayloads {
  log: LogLineEvent
  status: StatusChangedEvent
  players: PlayersChangedEvent
  'create-progress': CreateProgressEvent
  'modpack-progress': ModpackInstallProgress & { instanceId: string }
  /** How a server's move between nodes is going. */
  'migration-progress': {
    instanceId: string
    stage: string
    message: string
    percent: number | null
  }
  'backup-created': { instanceId: string; filename: string }
  'backup-failed': { instanceId: string; message: string }
  'filehub-upload': BackupUploadProgress
  /**
   * A server's endpoint list changed on this machine.
   *
   * Carried as an event so a node re-declares its ports to Portal at once
   * rather than on its next heartbeat — otherwise an endpoint added and then
   * published a second later is refused, because Portal has not been told the
   * node runs anything there yet.
   */
  'endpoints-changed': { instanceId: string }
  'portal-status': PortalSettings
  'node-updated': Node
}

export type ServerEventType = keyof ServerEventPayloads

/** Discriminated union, so narrowing on `type` narrows `payload` with it. */
export type ServerEvent = {
  [K in ServerEventType]: { type: K; payload: ServerEventPayloads[K] }
}[ServerEventType]
