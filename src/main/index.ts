import { app, shell, BrowserWindow, nativeTheme, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { ensureChunkforgeDirs } from './services/paths'
import { registerServerIpcHandlers } from './ipc/servers'
import { registerPluginIpcHandlers } from './ipc/plugins'
import { registerSettingsIpcHandlers } from './ipc/settings'
import { registerInstanceToolIpcHandlers } from './ipc/instanceTools'
import { registerFileHubIpcHandlers } from './ipc/filehub'
import { registerDashboardIpcHandlers } from './ipc/dashboard'
import { loadSettings } from './store/settingsStore'

// Lets tooling attach to the renderer during development for real diagnostics
// (CDP screenshots, DOM inspection) instead of guessing at rendering issues.
if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1040,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    // Deliberately opaque with no Mica backdrop: Mica blends the desktop
    // wallpaper through, which washes out the OLED-black surfaces, and pairing
    // it with an opaque background makes popups composite the window fully black.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#F7F5FC',
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

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
  await ensureChunkforgeDirs()
  await loadSettings()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createMainWindow()
  registerServerIpcHandlers(mainWindow)
  registerPluginIpcHandlers()
  registerSettingsIpcHandlers(mainWindow)
  registerInstanceToolIpcHandlers(mainWindow)
  registerFileHubIpcHandlers(mainWindow)
  registerDashboardIpcHandlers()

  ipcMain.handle('window:minimize', () => mainWindow.minimize())
  ipcMain.handle('window:maximizeToggle', () =>
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  )
  ipcMain.handle('window:close', () => mainWindow.close())
  ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized())

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized-changed', false))

  ipcMain.handle('theme:get', () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'))
  nativeTheme.on('updated', () => {
    mainWindow.webContents.send(
      'theme:system-changed',
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    )
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
