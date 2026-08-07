import { dialog, ipcMain, nativeTheme, shell, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { instancesRoot, loadInstanceMetadata } from '@chunkforge/core'

/**
 * What genuinely can't move to the Core API: OS dialogs, the shell, window
 * chrome, and the system theme. Everything else the renderer needs now goes
 * over HTTP to the embedded API, so the same UI works in a browser.
 */
export function registerNativeIpcHandlers(mainWindow: BrowserWindow): void {
  // ---- window chrome ----
  ipcMain.handle('window:minimize', () => mainWindow.minimize())
  ipcMain.handle('window:maximizeToggle', () =>
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  )
  ipcMain.handle('window:close', () => mainWindow.close())
  ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized())

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-changed', false))

  // ---- system theme ----
  ipcMain.handle('theme:get', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'))
  nativeTheme.on('updated', () => {
    mainWindow.webContents.send(
      'theme:system-changed',
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    )
  })

  // ---- shell and dialogs ----
  ipcMain.handle('native:openExternal', (_, url: string) => shell.openExternal(url))

  ipcMain.handle('native:openFolder', async (_, instanceId: string) => {
    const metadata = await loadInstanceMetadata(instanceId)
    await shell.openPath(metadata.path)
  })

  ipcMain.handle('native:openDataFolder', () => shell.openPath(instancesRoot()))

  ipcMain.handle('native:pickFolder', async (_, title: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle('native:getDefaultInstancesRoot', () => instancesRoot())

  // ---- server icon ----
  // Icon picking needs a native file dialog, so it stays here even though the
  // resulting file is plain server data.
  ipcMain.handle('native:getIcon', async (_, instanceId: string) => {
    const metadata = await loadInstanceMetadata(instanceId)
    const iconPath = join(metadata.path, 'server-icon.png')
    if (!existsSync(iconPath)) return null
    const data = await readFile(iconPath)
    return `data:image/png;base64,${data.toString('base64')}`
  })

  ipcMain.handle('native:pickIcon', async (_, instanceId: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a server icon',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    // Minecraft requires exactly 64x64 PNG.
    const resized = await sharp(result.filePaths[0]).resize(64, 64, { fit: 'cover' }).png().toBuffer()
    const metadata = await loadInstanceMetadata(instanceId)
    await writeFile(join(metadata.path, 'server-icon.png'), resized)
    return `data:image/png;base64,${resized.toString('base64')}`
  })

  ipcMain.handle('native:clearIcon', async (_, instanceId: string) => {
    const metadata = await loadInstanceMetadata(instanceId)
    await rm(join(metadata.path, 'server-icon.png'), { force: true })
  })
}
