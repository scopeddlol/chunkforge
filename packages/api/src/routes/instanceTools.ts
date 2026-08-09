import type { FastifyInstance } from 'fastify'
import {
  backupScheduler,
  createBackup,
  createDirectory,
  defaultBackupContents,
  defaultBackupSchedule,
  deleteBackup,
  deleteEntry,
  instanceManager,
  listBackups,
  listDirectory,
  listPlayers,
  loadInstanceMetadata,
  readTextFile,
  renameEntry,
  restoreBackup,
  saveInstanceMetadata,
  writeTextFile,
  type BackupContents,
  type BackupSchedule
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'

async function instancePath(id: string): Promise<string> {
  return (await loadInstanceMetadata(id)).path
}

/** Turns a thrown core error into a 400 rather than a 500. */
async function guard<T>(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, fn: () => Promise<T>) {
  try {
    return await fn()
  } catch (err) {
    return reply.code(400).send({ error: (err as Error).message })
  }
}

export async function registerInstanceToolRoutes(app: FastifyInstance): Promise<void> {
  // ---- players ----

  app.get<{ Params: { id: string } }>(
    '/api/servers/:id/players',
    { preHandler: requireRole('viewer') },
    async (request, reply) =>
      guard(reply, async () =>
        listPlayers(await instancePath(request.params.id), instanceManager.getOnlinePlayers(request.params.id))
      )
  )

  app.post<{ Params: { id: string }; Body: { action: string; name: string; reason?: string } }>(
    '/api/servers/:id/players/action',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      const { action, name, reason } = request.body
      // Moderation runs through the server's own console so the running server
      // stays the source of truth for ops, bans, and the whitelist.
      const commands: Record<string, string> = {
        op: `op ${name}`,
        deop: `deop ${name}`,
        kick: `kick ${name}${reason ? ` ${reason}` : ''}`,
        ban: `ban ${name}${reason ? ` ${reason}` : ''}`,
        pardon: `pardon ${name}`,
        whitelistAdd: `whitelist add ${name}`,
        whitelistRemove: `whitelist remove ${name}`
      }
      const command = commands[action]
      if (!command) return reply.code(400).send({ error: `Unknown player action: ${action}` })
      return guard(reply, async () => {
        instanceManager.sendCommand(request.params.id, command)
        return { ok: true }
      })
    }
  )

  app.post<{ Params: { id: string }; Body: { message: string } }>(
    '/api/servers/:id/say',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => {
        instanceManager.sendCommand(request.params.id, `say ${request.body.message}`)
        return { ok: true }
      })
  )

  // ---- files ----

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    '/api/servers/:id/files',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => listDirectory(await instancePath(request.params.id), request.query.path ?? ''))
  )

  app.get<{ Params: { id: string }; Querystring: { path: string } }>(
    '/api/servers/:id/files/content',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => ({
        content: await readTextFile(await instancePath(request.params.id), request.query.path)
      }))
  )

  app.put<{ Params: { id: string }; Body: { path: string; content: string } }>(
    '/api/servers/:id/files/content',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => {
        await writeTextFile(await instancePath(request.params.id), request.body.path, request.body.content)
        return { ok: true }
      })
  )

  app.delete<{ Params: { id: string }; Querystring: { path: string } }>(
    '/api/servers/:id/files',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => {
        await deleteEntry(await instancePath(request.params.id), request.query.path)
        return { ok: true }
      })
  )

  app.post<{ Params: { id: string }; Body: { path: string; newName?: string; createFolder?: boolean } }>(
    '/api/servers/:id/files',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => {
        const root = await instancePath(request.params.id)
        if (request.body.createFolder) await createDirectory(root, request.body.path)
        else if (request.body.newName) await renameEntry(root, request.body.path, request.body.newName)
        return { ok: true }
      })
  )

  // ---- backups ----

  app.get<{ Params: { id: string } }>(
    '/api/servers/:id/backups',
    { preHandler: requireRole('viewer') },
    async (request, reply) => guard(reply, async () => listBackups(await instancePath(request.params.id)))
  )

  app.post<{ Params: { id: string }; Body?: { contents?: BackupContents } }>(
    '/api/servers/:id/backups',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => {
        // Falls back to the server's own schedule choice, then to worlds — so
        // a one-off backup captures what that server normally captures rather
        // than something narrower the caller never chose.
        const metadata = await loadInstanceMetadata(request.params.id)
        const contents =
          request.body?.contents ?? metadata.backupSchedule?.contents ?? defaultBackupContents
        return createBackup(metadata.path, contents)
      })
  )

  app.post<{ Params: { id: string; filename: string } }>(
    '/api/servers/:id/backups/:filename/restore',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => {
        await restoreBackup(await instancePath(request.params.id), decodeURIComponent(request.params.filename))
        return { ok: true }
      })
  )

  app.delete<{ Params: { id: string; filename: string } }>(
    '/api/servers/:id/backups/:filename',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => {
        await deleteBackup(await instancePath(request.params.id), decodeURIComponent(request.params.filename))
        return { ok: true }
      })
  )

  app.get<{ Params: { id: string } }>(
    '/api/servers/:id/backups/schedule',
    { preHandler: requireRole('viewer') },
    async (request, reply) =>
      guard(reply, async () => {
        const metadata = await loadInstanceMetadata(request.params.id)
        return metadata.backupSchedule ?? defaultBackupSchedule
      })
  )

  app.put<{ Params: { id: string }; Body: BackupSchedule }>(
    '/api/servers/:id/backups/schedule',
    { preHandler: requireRole('member') },
    async (request, reply) =>
      guard(reply, async () => {
        const metadata = await loadInstanceMetadata(request.params.id)
        await saveInstanceMetadata({ ...metadata, backupSchedule: request.body })
        backupScheduler.reset(request.params.id)
        return request.body
      })
  )
}
