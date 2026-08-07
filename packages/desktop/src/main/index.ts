import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startCoreApi, type RunningCoreApi } from '@chunkforge/api'
import { registerNativeIpcHandlers } from './ipc/native'

// Lets tooling attach to the renderer during development for real diagnostics
// (CDP screenshots, DOM inspection) instead of guessing at rendering issues.
if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

let coreApi: RunningCoreApi | null = null

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1040,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.chunkforge.app')

  // The desktop app embeds the Core API in-process, so it works standalone and
  // offline while running the exact same code the Docker panel does. Binding to
  // loopback on an OS-assigned port keeps it off the network and collision-free.
  coreApi = await startCoreApi({
    dataRoot: join(app.getPath('documents'), 'Chunkforge'),
    host: '127.0.0.1'
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createMainWindow()
  registerNativeIpcHandlers(mainWindow)

  // The renderer needs to know where its embedded API is listening.
  ipcMain.handle('native:apiUrl', () => coreApi?.url ?? null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await coreApi?.close().catch(() => undefined)
})
