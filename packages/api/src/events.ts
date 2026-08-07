import type { FastifyInstance } from 'fastify'
import { instanceManager } from '@chunkforge/core'

/**
 * Chunkforge's live data is already event-driven inside core — the instance
 * manager emits log lines, status changes, player joins, and creation progress.
 * This forwards those to every connected client over one WebSocket, so the
 * desktop, web, and mobile clients all consume the same stream instead of
 * polling.
 */
export interface ServerEvent {
  type:
    | 'log'
    | 'status'
    | 'players'
    | 'create-progress'
    | 'modpack-progress'
    | 'backup-created'
    | 'backup-failed'
    | 'filehub-upload'
  payload: unknown
}

/** Minimal shape we need from a WebSocket, so this file doesn't depend on ws types. */
interface EventSocket {
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  on: (event: string, listener: () => void) => void
}

const sockets = new Set<EventSocket>()

export function broadcast(event: ServerEvent): void {
  const message = JSON.stringify(event)
  for (const socket of sockets) {
    try {
      socket.send(message)
    } catch {
      // A failed send means the peer is gone; the close handler will evict it.
    }
  }
}

export function attachCoreEvents(): void {
  instanceManager.on('log', (payload) => broadcast({ type: 'log', payload }))
  instanceManager.on('status-changed', (payload) => broadcast({ type: 'status', payload }))
  instanceManager.on('players-changed', (payload) => broadcast({ type: 'players', payload }))
  instanceManager.on('create-progress', (payload) => broadcast({ type: 'create-progress', payload }))
}

export async function registerEventSocket(app: FastifyInstance): Promise<void> {
  app.get('/api/events', { websocket: true }, (connection, request) => {
    // @fastify/websocket v11 hands the socket in directly; older majors wrapped
    // it in { socket }. Accept either so a bump doesn't silently break the feed.
    const socket = ('socket' in connection ? connection.socket : connection) as EventSocket

    // The upgrade request carries the same cookie/bearer auth as normal routes.
    if (!request.user) {
      socket.close(1008, 'Sign in required')
      return
    }

    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => sockets.delete(socket))
  })
}
