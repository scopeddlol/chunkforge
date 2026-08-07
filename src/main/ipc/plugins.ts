import { ipcMain, shell } from 'electron'
import type { PluginSearchQuery, PluginSource, PluginVersion } from '../../shared/types'
import {
  availableSources,
  installPlugin,
  listInstalledPlugins,
  listPluginVersions,
  searchPlugins,
  setPluginEnabled,
  uninstallPlugin
} from '../services/plugins/pluginRegistry'
import { listModpackVersions, searchModpacks } from '../services/plugins/modpacks'
import { installModpack, readModpackTarget } from '../services/modpackService'
import { loadInstanceMetadata } from '../store/instancesStore'

export function registerPluginIpcHandlers(): void {
  ipcMain.handle('plugins:search', (_, query: PluginSearchQuery) => searchPlugins(query))

  ipcMain.handle('plugins:availableSources', () => availableSources())

  ipcMain.handle('plugins:listVersions', (_, source: PluginSource, projectId: string) =>
    listPluginVersions(source, projectId)
  )

  ipcMain.handle('plugins:listInstalled', async (_, instanceId: string) => {
    const metadata = await loadInstanceMetadata(instanceId)
    return listInstalledPlugins(metadata.path, metadata.serverType)
  })

  ipcMain.handle(
    'plugins:install',
    async (_, instanceId: string, version: PluginVersion, fallbackName: string) => {
      const metadata = await loadInstanceMetadata(instanceId)
      return installPlugin(metadata.path, metadata.serverType, version, fallbackName)
    }
  )

  ipcMain.handle('plugins:setEnabled', async (_, instanceId: string, filename: string, enabled: boolean) => {
    const metadata = await loadInstanceMetadata(instanceId)
    await setPluginEnabled(metadata.path, metadata.serverType, filename, enabled)
  })

  ipcMain.handle('plugins:uninstall', async (_, instanceId: string, filename: string) => {
    const metadata = await loadInstanceMetadata(instanceId)
    await uninstallPlugin(metadata.path, metadata.serverType, filename)
  })

  ipcMain.handle('plugins:openExternal', (_, url: string) => shell.openExternal(url))

  // --- Modpacks ---
  ipcMain.handle('modpacks:search', (_, query: string, limit: number) => searchModpacks(query, limit))

  ipcMain.handle('modpacks:listVersions', (_, source: PluginSource, projectId: string) =>
    listModpackVersions(source, projectId)
  )

  ipcMain.handle('modpacks:inspect', (_, source: PluginSource, downloadUrl: string) =>
    readModpackTarget(source, downloadUrl)
  )

  ipcMain.handle(
    'modpacks:install',
    async (event, instanceId: string, source: PluginSource, downloadUrl: string) => {
      const metadata = await loadInstanceMetadata(instanceId)
      await installModpack(source, downloadUrl, metadata.path, (progress) => {
        event.sender.send('modpacks:progress', { instanceId, ...progress })
      })
    }
  )
}
