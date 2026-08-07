import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { defaultBackupSchedule, type BackupSchedule } from '../../shared/types'
import { instanceManager } from '../services/instanceManager'
import { backupScheduler } from '../services/backupScheduler'
import { loadInstanceMetadata, saveInstanceMetadata } from '../store/instancesStore'
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

  ipcMain.handle('backups:getSchedule', async (_, id: string) => {
    const metadata = await loadInstanceMetadata(id)
    return metadata.backupSchedule ?? defaultBackupSchedule
  })

  ipcMain.handle('backups:setSchedule', async (_, id: string, schedule: BackupSchedule) => {
    const metadata = await loadInstanceMetadata(id)
    await saveInstanceMetadata({ ...metadata, backupSchedule: schedule })
    backupScheduler.reset(id)
    return schedule
  })

  // --- Server icon ---
  // Minecraft reads server-icon.png from the server root, so Chunkforge uses
  // that same file as the list thumbnail instead of inventing its own.
  ipcMain.handle('servers:getIcon', async (_, id: string) => {
    const iconPath = join(await instancePath(id), 'server-icon.png')
    if (!existsSync(iconPath)) return null
    const data = await readFile(iconPath)
    return `data:image/png;base64,${data.toString('base64')}`
  })

  ipcMain.handle('servers:pickIcon', async (_, id: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a server icon',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    // Minecraft requires exactly 64x64 PNG.
    const resized = await sharp(result.filePaths[0]).resize(64, 64, { fit: 'cover' }).png().toBuffer()
    await writeFile(join(await instancePath(id), 'server-icon.png'), resized)
    return `data:image/png;base64,${resized.toString('base64')}`
  })

  ipcMain.handle('servers:clearIcon', async (_, id: string) => {
    await rm(join(await instancePath(id), 'server-icon.png'), { force: true })
  })
}
