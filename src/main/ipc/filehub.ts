import { ipcMain, type BrowserWindow } from 'electron'
import { join } from 'path'
import type { BackupUploadProgress, FileHubStatus } from '../../shared/types'
import { FileHubClient, FileHubError } from '../services/filehubClient'
import { getSettings, saveSettings } from '../store/settingsStore'
import { loadInstanceMetadata } from '../store/instancesStore'

function clientFromSettings(): FileHubClient | null {
  const { fileHub } = getSettings()
  if (!fileHub.baseUrl) return null
  return new FileHubClient(fileHub.baseUrl, fileHub.sessionCookie)
}

export function registerFileHubIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('filehub:status', async (): Promise<FileHubStatus> => {
    const { fileHub } = getSettings()
    if (!fileHub.baseUrl) {
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

  ipcMain.handle(
    'filehub:login',
    async (_, baseUrl: string, username: string, password: string, totp?: string) => {
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
        fileHub: { ...current, baseUrl: baseUrl.replace(/\/+$/, ''), username, sessionCookie: client.getCookie() }
      })
      return { ok: true, totpRequired: false, message: null }
    }
  )

  ipcMain.handle('filehub:logout', async () => {
    const current = getSettings().fileHub
    await saveSettings({ fileHub: { ...current, sessionCookie: null } })
  })

  ipcMain.handle('filehub:listFolders', async () => {
    const client = clientFromSettings()
    if (!client) throw new Error('FileHub is not configured')
    return client.listFolders()
  })

  ipcMain.handle('filehub:uploadBackup', async (_, instanceId: string, filename: string) => {
    const client = clientFromSettings()
    const { fileHub } = getSettings()
    if (!client || !fileHub.sessionCookie) throw new Error('Sign in to FileHub first (Settings → FileHub)')

    const metadata = await loadInstanceMetadata(instanceId)
    const archivePath = join(metadata.path, 'chunkforge-backups', filename)

    const emit = (progress: BackupUploadProgress): void => {
      mainWindow.webContents.send('filehub:upload-progress', progress)
    }

    try {
      await client.uploadFile(archivePath, {
        parentId: fileHub.folderId,
        onProgress: (percent) => emit({ instanceId, filename, percent, done: false, error: null })
      })
      emit({ instanceId, filename, percent: 100, done: true, error: null })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      emit({ instanceId, filename, percent: 0, done: true, error: message })
      throw new Error(message)
    }
  })
}
