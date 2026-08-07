import { ipcMain, type BrowserWindow } from 'electron'
import { instanceManager } from '../services/instanceManager'
import { loadInstanceMetadata } from '../store/instancesStore'
import { listPlayers } from '../services/playersService'
import {
  createDirectory,
  deleteEntry,
  listDirectory,
  readTextFile,
  renameEntry,
  writeTextFile
} from '../services/filesService'
import { createBackup, deleteBackup, listBackups, restoreBackup } from '../services/backupsService'

async function instancePath(id: string): Promise<string> {
  return (await loadInstanceMetadata(id)).path
}

export function registerInstanceToolIpcHandlers(mainWindow: BrowserWindow): void {
  instanceManager.on('players-changed', (event) => mainWindow.webContents.send('players:changed', event))

  // --- Players ---
  ipcMain.handle('players:list', async (_, id: string) =>
    listPlayers(await instancePath(id), instanceManager.getOnlinePlayers(id))
  )

  ipcMain.handle('players:online', (_, id: string) => instanceManager.getOnlinePlayers(id))

  ipcMain.handle('players:action', (_, id: string, action: string, name: string, reason?: string) => {
    // Player moderation goes through the server's own console commands so the
    // running server stays the source of truth for ops/bans/whitelist.
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
    if (!command) throw new Error(`Unknown player action: ${action}`)
    instanceManager.sendCommand(id, command)
  })

  ipcMain.handle('players:say', (_, id: string, message: string) => {
    instanceManager.sendCommand(id, `say ${message}`)
  })

  // --- Files ---
  ipcMain.handle('files:list', async (_, id: string, relativePath: string) =>
    listDirectory(await instancePath(id), relativePath)
  )
  ipcMain.handle('files:read', async (_, id: string, relativePath: string) =>
    readTextFile(await instancePath(id), relativePath)
  )
  ipcMain.handle('files:write', async (_, id: string, relativePath: string, contents: string) =>
    writeTextFile(await instancePath(id), relativePath, contents)
  )
  ipcMain.handle('files:delete', async (_, id: string, relativePath: string) =>
    deleteEntry(await instancePath(id), relativePath)
  )
  ipcMain.handle('files:rename', async (_, id: string, relativePath: string, newName: string) =>
    renameEntry(await instancePath(id), relativePath, newName)
  )
  ipcMain.handle('files:createFolder', async (_, id: string, relativePath: string) =>
    createDirectory(await instancePath(id), relativePath)
  )

  // --- Backups ---
  ipcMain.handle('backups:list', async (_, id: string) => listBackups(await instancePath(id)))
  ipcMain.handle('backups:create', async (_, id: string) => createBackup(await instancePath(id)))
  ipcMain.handle('backups:restore', async (_, id: string, filename: string) =>
    restoreBackup(await instancePath(id), filename)
  )
  ipcMain.handle('backups:delete', async (_, id: string, filename: string) =>
    deleteBackup(await instancePath(id), filename)
  )
}
