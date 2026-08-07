import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import type { AppSettings } from '../../shared/types'
import { loadSettings, saveSettings } from '../store/settingsStore'
import { chunkforgeRoot } from '../services/paths'
import { detectInstalledJava } from '../services/javaManager'

export function registerSettingsIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:update', (_, patch: Partial<AppSettings>) => saveSettings(patch))

  ipcMain.handle('settings:detectJava', () => detectInstalledJava())

  ipcMain.handle('settings:openDataFolder', () => shell.openPath(chunkforgeRoot()))

  ipcMain.handle('settings:pickFolder', async (_, title: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
