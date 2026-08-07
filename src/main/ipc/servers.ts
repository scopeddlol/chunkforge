import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { CreateInstanceConfig, InstanceMetadata, InstanceSummary } from '../../shared/types'
import { instanceManager } from '../services/instanceManager'
import { listVersions } from '../services/jarAcquisition'
import { instancesRoot } from '../services/paths'
import { renderServerProperties } from '../services/serverProperties'
import {
  listInstanceMetadata,
  loadInstanceMetadata,
  removeInstanceFromIndex,
  saveInstanceMetadata
} from '../store/instancesStore'

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

  ipcMain.handle('servers:getDefaultInstancesRoot', () => instancesRoot())

  ipcMain.handle('servers:openFolder', async (_, id: string) => {
    const metadata = await loadInstanceMetadata(id)
    await shell.openPath(metadata.path)
  })

  ipcMain.handle('servers:delete', async (_, id: string, deleteFiles: boolean) => {
    await instanceManager.stopInstance(id).catch(() => undefined)
    const metadata = await loadInstanceMetadata(id)
    if (deleteFiles) await rm(metadata.path, { recursive: true, force: true })
    await removeInstanceFromIndex(id)
  })

  ipcMain.handle('servers:updateSettings', async (_, id: string, patch: Partial<InstanceMetadata>) => {
    const metadata = await loadInstanceMetadata(id)
    // Only fields that are safe to edit after creation.
    const next: InstanceMetadata = {
      ...metadata,
      name: patch.name ?? metadata.name,
      port: patch.port ?? metadata.port,
      minRamMb: patch.minRamMb ?? metadata.minRamMb,
      maxRamMb: patch.maxRamMb ?? metadata.maxRamMb,
      accentColor: patch.accentColor ?? metadata.accentColor,
      ramAllocatedMb: patch.maxRamMb ?? metadata.maxRamMb,
      toggles: patch.toggles ?? metadata.toggles
    }
    await saveInstanceMetadata(next)
    await writeFile(join(next.path, 'server.properties'), renderServerProperties(next.port, next.toggles), 'utf-8')
    return next
  })

  ipcMain.handle('servers:pickInstallLocation', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose where to create the server',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
