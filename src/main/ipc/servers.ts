import { ipcMain, type BrowserWindow } from 'electron'
import type { CreateInstanceConfig, InstanceSummary } from '../../shared/types'
import { instanceManager } from '../services/instanceManager'
import { listVersions } from '../services/jarAcquisition'
import { listInstanceMetadata, loadInstanceMetadata, saveInstanceMetadata } from '../store/instancesStore'

function toSummary(metadata: Awaited<ReturnType<typeof listInstanceMetadata>>[number]): InstanceSummary {
  const { path: _path, javaPath: _javaPath, minRamMb: _minRamMb, port: _port, toggles: _toggles, eulaAccepted: _eulaAccepted, ...summary } =
    metadata
  return { ...summary, status: instanceManager.getStatus(metadata.id) }
}

export function registerServerIpcHandlers(mainWindow: BrowserWindow): void {
  instanceManager.on('log', (event) => mainWindow.webContents.send('servers:log', event))
  instanceManager.on('status-changed', (event) => mainWindow.webContents.send('servers:status-changed', event))
  instanceManager.on('create-progress', (event) => mainWindow.webContents.send('servers:create-progress', event))

  ipcMain.handle('servers:list', async () => {
    const all = await listInstanceMetadata()
    return all.map(toSummary)
  })

  ipcMain.handle('servers:getMetadata', async (_, id: string) => {
    return loadInstanceMetadata(id)
  })

  ipcMain.handle('servers:create', async (_, config: CreateInstanceConfig) => {
    return instanceManager.createInstance(config)
  })

  ipcMain.handle('servers:start', async (_, id: string) => {
    const metadata = await loadInstanceMetadata(id)
    await instanceManager.startInstance(metadata)
  })

  ipcMain.handle('servers:stop', async (_, id: string) => {
    await instanceManager.stopInstance(id)
  })

  ipcMain.handle('servers:sendCommand', async (_, id: string, command: string) => {
    instanceManager.sendCommand(id, command)
  })

  ipcMain.handle('servers:listVersions', async (_, serverType: CreateInstanceConfig['serverType']) => {
    return listVersions(serverType)
  })

  ipcMain.handle('servers:updateToggles', async (_, id: string, toggles: CreateInstanceConfig['toggles']) => {
    const metadata = await loadInstanceMetadata(id)
    metadata.toggles = toggles
    await saveInstanceMetadata(metadata)
    return metadata
  })
}
