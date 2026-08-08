import { app, dialog, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { startCoreApi, type RunningCoreApi } from '@chunkforge/api'
import { registerNativeIpcHandlers } from './ipc/native'

/**
 * A failure here before the window exists is otherwise invisible: Electron
 * does not crash or print anywhere a double-click launch can see, so the
 * process just sits alive in Task Manager forever with nothing on screen and
 * no way to tell why. A missing dependency in a packaged build is exactly the
 * kind of thing that only shows up this way — showing a real dialog and
 * exiting turns that into a bug report instead of a support ticket.
 */
function reportFatalStartupError(error: unknown): void {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error('Chunkforge failed to start:', message)
  dialog.showErrorBox('Chunkforge failed to start', message)
  app.exit(1)
}

/**
 * Only failures *before* the window exists are fatal.
 *
 * Once Chunkforge is on screen the same handler would be actively harmful:
 * a dropped Portal socket or a rejected background fetch is an ordinary event
 * in a long-running app, and tearing the whole process down over one would
 * look, to the person using it, exactly like the crash this handler was added
 * to explain. After startup they are logged and the app keeps running.
 */
let started = false

process.on('uncaughtException', (error) => {
  if (started) return console.error('Chunkforge error:', error)
  reportFatalStartupError(error)
})
process.on('unhandledRejection', (reason) => {
  if (started) return console.error('Chunkforge unhandled rejection:', reason)
  reportFatalStartupError(reason)
})

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
    host: '127.0.0.1',
    localOwner: true,
    // The renderer is a different origin from the API in both modes: a
    // file:// document reports `null`, and in development it is served by Vite.
    allowedOrigins: ['null', process.env['ELECTRON_RENDERER_URL'] ?? ''].filter(Boolean)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createMainWindow()
  registerNativeIpcHandlers(mainWindow)

  // The renderer needs to know where its embedded API is listening, and the
  // session that authenticates it as the machine's owner.
  ipcMain.handle('native:apiUrl', () => coreApi?.url ?? null)
  ipcMain.handle('native:apiToken', () => coreApi?.sessionToken ?? null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })

  started = true
}).catch(reportFatalStartupError)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await coreApi?.close().catch(() => undefined)
})
