import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'path'
import { electronApp, is } from '@electron-toolkit/utils'
import { startNodeAgent, type RunningNodeAgent } from '@chunkforge/node-worker'
import { hasPaired, isConfigured, loadConfig, saveConfig, type NodeConfig } from './config'
import { trayIcon } from './icon'

/**
 * Chunkforge Node for Windows.
 *
 * The same node the Docker image runs, wrapped in the smallest shell that
 * makes it usable on a desktop OS: one window to enter a Portal address and a
 * pairing pin, and a tray icon so it keeps running once that window is closed.
 *
 * Deliberately not a true Windows service. A service runs as SYSTEM, which
 * means an installer that needs administrator rights, a separate UI process to
 * configure it, and Minecraft servers owned by an account with no desktop —
 * all of it to solve a problem this does not have. Starting at logon reaches
 * the same place for a machine somebody is running game servers on.
 */

type NodeStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'running'; nodeId: string; since: string }
  | { state: 'error'; message: string }

let tray: Tray | null = null
let window: BrowserWindow | null = null
let agent: RunningNodeAgent | null = null
let status: NodeStatus = { state: 'stopped' }
let config: NodeConfig
let quitting = false

const configPath = join(app.getPath('userData'), 'node-config.json')
const defaultDataRoot = join(app.getPath('documents'), 'Chunkforge Node')

function publishStatus(): void {
  window?.webContents.send('node:status', status)
  refreshTrayMenu()
}

function setStatus(next: NodeStatus): void {
  status = next
  publishStatus()
}

async function startNode(): Promise<void> {
  if (agent) return
  if (!isConfigured(config)) {
    setStatus({ state: 'stopped' })
    return
  }

  setStatus({ state: 'starting' })
  try {
    agent = await startNodeAgent({
      portalUrl: config.portalUrl.trim(),
      // Left as-is once paired: the node worker prefers its stored token and
      // ignores this, so a spent pin sitting in the config is harmless.
      pairingPin: config.pairingPin.trim() || undefined,
      nodeName: config.nodeName.trim() || undefined,
      dataRoot: config.dataRoot
    })
    setStatus({ state: 'running', nodeId: agent.nodeId, since: new Date().toISOString() })
    // The pin is spent the moment it works. Clearing it means a config file
    // that cannot be replayed, and a settings window that stops showing a
    // credential which no longer opens anything.
    if (config.pairingPin) {
      config = { ...config, pairingPin: '' }
      await saveConfig(configPath, config)
      window?.webContents.send('node:config', config)
    }
  } catch (err) {
    agent = null
    setStatus({ state: 'error', message: (err as Error).message })
  }
}

async function stopNode(): Promise<void> {
  const current = agent
  agent = null
  setStatus({ state: 'stopped' })
  await current?.close().catch(() => undefined)
}

function showWindow(): void {
  if (window) {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    return
  }

  window = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#12101A',
    title: 'Chunkforge Node',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window?.show())
  // Closing the window leaves the node running — that is the whole point of
  // living in the tray. Quit is an explicit choice from the tray menu.
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    window?.hide()
  })
  window.on('closed', () => {
    window = null
  })
  window.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function statusLabel(): string {
  switch (status.state) {
    case 'running':
      return 'Connected to Portal'
    case 'starting':
      return 'Connecting…'
    case 'error':
      return `Not connected — ${status.message}`
    default:
      return isConfigured(config) ? 'Stopped' : 'Not set up yet'
  }
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setToolTip(`Chunkforge Node — ${statusLabel()}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: statusLabel(), enabled: false },
      { type: 'separator' },
      { label: 'Open Chunkforge Node', click: () => showWindow() },
      {
        label: status.state === 'running' ? 'Stop node' : 'Start node',
        enabled: isConfigured(config) && status.state !== 'starting',
        click: () => void (status.state === 'running' ? stopNode() : startNode())
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          void stopNode().finally(() => app.quit())
        }
      }
    ])
  )
}

function applyAutoStart(enabled: boolean): void {
  // Silently unsupported on Linux, which is fine — this ships for Windows and
  // the setting simply has no effect anywhere it cannot be honoured.
  if (process.platform === 'linux') return
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
}

// One node per machine. A second copy would fight the first for the same data
// directory and the same Portal pairing, so hand focus back and exit.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.chunkforge.node')
    config = await loadConfig(configPath, defaultDataRoot)
    applyAutoStart(config.autoStart)

    tray = new Tray(nativeImage.createFromDataURL(trayIcon))
    tray.on('click', () => showWindow())
    refreshTrayMenu()

    ipcMain.handle('node:getConfig', () => config)
    ipcMain.handle('node:getStatus', () => status)
    ipcMain.handle('node:hasPaired', () => hasPaired(config.dataRoot))
    ipcMain.handle('node:save', async (_event, next: NodeConfig) => {
      config = { ...config, ...next }
      await saveConfig(configPath, config)
      applyAutoStart(config.autoStart)
      // Restart against the new settings rather than making the user do it —
      // every field here changes which Portal or disk the node is using.
      await stopNode()
      await startNode()
      return { config, status }
    })
    ipcMain.handle('node:start', () => startNode())
    ipcMain.handle('node:stop', () => stopNode())
    ipcMain.handle('node:chooseDataRoot', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: config.dataRoot
      })
      return result.canceled ? null : result.filePaths[0]
    })

    // A configured node starts straight into the tray. An unconfigured one has
    // nothing to do but ask, so it shows the window — including when Windows
    // launched it at logon, where --hidden would otherwise hide the only thing
    // standing between the user and a working node.
    if (isConfigured(config)) {
      void startNode()
      if (!process.argv.includes('--hidden')) showWindow()
    } else {
      showWindow()
    }
  })
}

app.on('window-all-closed', () => {
  // Explicitly nothing: the tray is the app.
})

app.on('before-quit', () => {
  quitting = true
})
