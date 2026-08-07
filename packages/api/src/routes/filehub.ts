import { join } from 'path'
import type { FastifyInstance } from 'fastify'
import {
  FileHubClient,
  FileHubError,
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
      const client = clientFromSettings()
      const { fileHub } = getSettings()
      if (!client || !fileHub?.sessionCookie) {
        return reply.code(409).send({ error: 'Sign in to FileHub first (Settings → FileHub)' })
      }

      const instanceId = request.params.id
      const { filename } = request.body
      const metadata = await loadInstanceMetadata(instanceId)
      const archivePath = join(metadata.path, 'chunkforge-backups', filename)

      const emit = (percent: number, done: boolean, error: string | null): void => {
        broadcast({ type: 'filehub-upload', payload: { instanceId, filename, percent, done, error } })
      }

      try {
        // Each server's archives go into a folder named after it, resolved once
        // and then remembered on the instance.
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
        return { ok: true }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        emit(0, true, message)
        return reply.code(502).send({ error: message })
      }
    }
  )
}
