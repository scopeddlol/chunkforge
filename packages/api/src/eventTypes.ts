import type {
  BackupUploadProgress,
  CreateProgressEvent,
  LogLineEvent,
  ModpackInstallProgress,
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
  'backup-created': { instanceId: string; filename: string }
  'backup-failed': { instanceId: string; message: string }
  'filehub-upload': BackupUploadProgress
}

export type ServerEventType = keyof ServerEventPayloads

/** Discriminated union, so narrowing on `type` narrows `payload` with it. */
export type ServerEvent = {
  [K in ServerEventType]: { type: K; payload: ServerEventPayloads[K] }
}[ServerEventType]
