import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import {
  FileHubClient,
  FileHubError,
  backupScheduler,
  getSettings,
  loadInstanceMetadata,
  saveInstanceMetadata,
  saveSettings
} from '@chunkforge/core'
import { requireRole } from '../auth/plugin'
import { broadcast } from '../events'

function clientFromSettings(): FileHubClient | null {
  const { fileHub } = getSettings()
  if (!fileHub?.baseUrl) return null
  return new FileHubClient(fileHub.baseUrl, fileHub.sessionCookie)
}

/**
 * Uploads a backup archive, filing it under a FileHub folder named after the
 * server so archives from different servers don't pile up together. The folder
 * id is remembered on the instance to avoid re-resolving it every time.
 *
 * Shared by the manual upload route and the scheduler, which must take exactly
 * the same path — a scheduled upload that behaved differently from a manual one
 * would be a nasty thing to debug.
 */
export async function uploadBackup(instanceId: string, filename: string): Promise<void> {
  const client = clientFromSettings()
  const { fileHub } = getSettings()

  const emit = (percent: number, done: boolean, error: string | null): void => {
    broadcast({ type: 'filehub-upload', payload: { instanceId, filename, percent, done, error } })
  }

  if (!client || !fileHub?.sessionCookie) {
    throw new Error('Sign in to FileHub first (Settings → FileHub)')
  }

  const metadata = await loadInstanceMetadata(instanceId)
  const archivePath = join(metadata.path, 'chunkforge-backups', filename)

  try {
    let folderId = metadata.fileHubFolderId ?? null
    if (!folderId) {
      folderId = await client.ensureFolder(metadata.name, fileHub.folderId)
      await saveInstanceMetadata({ ...metadata, fileHubFolderId: folderId })
    }

    await client.uploadFile(archivePath, {
      parentId: folderId,
      onProgress: (percent) => emit(percent, false, null)
    })
    emit(100, true, null)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    emit(0, true, message)
    throw new Error(message)
  }
}

// The scheduler is a process-wide singleton, so its listeners must be attached
// once even if the API is constructed more than once (tests, embedded restarts).
let schedulerAttached = false

function attachBackupScheduler(): void {
  if (schedulerAttached) return
  schedulerAttached = true

  // Scheduled backups reuse the same upload path as the manual button.
  backupScheduler.on('upload-requested', ({ instanceId, filename }) => {
    void uploadBackup(instanceId, filename).catch(() => undefined)
  })
  backupScheduler.on('backup-created', (payload) => broadcast({ type: 'backup-created', payload }))
  backupScheduler.on('backup-failed', (payload) => broadcast({ type: 'backup-failed', payload }))
  backupScheduler.start()
}

export async function registerFileHubRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/filehub/status', { preHandler: requireRole('viewer') }, async () => {
    const { fileHub } = getSettings()
    if (!fileHub?.baseUrl) {
      return { configured: false, connected: false, username: null, message: null }
    }
    const client = clientFromSettings()
    if (!client || !fileHub.sessionCookie) {
      return { configured: true, connected: false, username: null, message: 'Not signed in' }
    }
    try {
      const me = await client.me()
      return { configured: true, connected: true, username: me.username ?? fileHub.username, message: null }
    } catch (err) {
      return {
        configured: true,
        connected: false,
        username: null,
        message: err instanceof Error ? err.message : 'Connection failed'
      }
    }
  })

  app.post<{ Body: { baseUrl: string; username: string; password: string; totp?: string } }>(
    '/api/filehub/login',
    { preHandler: requireRole('admin') },
    async (request) => {
      const { baseUrl, username, password, totp } = request.body
      const client = new FileHubClient(baseUrl)
      try {
        await client.login(username, password, totp)
      } catch (err) {
        if (err instanceof FileHubError && err.totpRequired) {
          return { ok: false, totpRequired: true, message: 'Two-factor code required' }
        }
        return {
          ok: false,
          totpRequired: false,
          message: err instanceof Error ? err.message : 'Sign-in failed'
        }
      }

      // Only the session cookie is persisted — never the password.
      const current = getSettings().fileHub
      await saveSettings({
        fileHub: {
          ...current,
          baseUrl: baseUrl.replace(/\/+$/, ''),
          username,
          sessionCookie: client.getCookie()
        }
      })
      return { ok: true, totpRequired: false, message: null }
    }
  )

  app.post('/api/filehub/logout', { preHandler: requireRole('admin') }, async () => {
    const current = getSettings().fileHub
    await saveSettings({ fileHub: { ...current, sessionCookie: null } })
    return { ok: true }
  })

  app.get('/api/filehub/folders', { preHandler: requireRole('member') }, async (_request, reply) => {
    const client = clientFromSettings()
    if (!client) return reply.code(409).send({ error: 'FileHub is not configured' })
    try {
      return await client.listFolders()
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message })
    }
  })

  app.post<{ Params: { id: string }; Body: { filename: string } }>(
    '/api/servers/:id/filehub/upload',
    { preHandler: requireRole('member') },
    async (request, reply) => {
      try {
        await uploadBackup(request.params.id, request.body.filename)
        return { ok: true }
      } catch (err) {
        return reply.code(502).send({ error: (err as Error).message })
      }
    }
  )

  attachBackupScheduler()
}
