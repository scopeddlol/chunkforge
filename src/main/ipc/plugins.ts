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
import { loadInstanceMetadata } from '../store/instancesStore'

export function registerPluginIpcHandlers(): void {
  ipcMain.handle('plugins:search', (_, query: PluginSearchQuery) => searchPlugins(query))

  ipcMain.handle('plugins:availableSources', () => availableSources())

  ipcMain.handle('plugins:listVersions', (_, source: PluginSource, projectId: string) =>
    listPluginVersions(source, projectId)
  )

  ipcMain.handle('plugins:listInstalled', async (_, instanceId: string) => {
    const metadata = await loadInstanceMetadata(instanceId)
    return listInstalledPlugins(metadata.path)
  })

  ipcMain.handle(
    'plugins:install',
    async (_, instanceId: string, version: PluginVersion, fallbackName: string) => {
      const metadata = await loadInstanceMetadata(instanceId)
      return installPlugin(metadata.path, version, fallbackName)
    }
  )

  ipcMain.handle('plugins:setEnabled', async (_, instanceId: string, filename: string, enabled: boolean) => {
    const metadata = await loadInstanceMetadata(instanceId)
    await setPluginEnabled(metadata.path, filename, enabled)
  })

  ipcMain.handle('plugins:uninstall', async (_, instanceId: string, filename: string) => {
    const metadata = await loadInstanceMetadata(instanceId)
    await uninstallPlugin(metadata.path, filename)
  })

  ipcMain.handle('plugins:openExternal', (_, url: string) => shell.openExternal(url))
}
