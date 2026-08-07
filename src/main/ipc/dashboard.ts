import { ipcMain } from 'electron'
import { randomBytes } from 'crypto'
import type { ServerGroup } from '../../shared/types'
import { collectDashboardStats } from '../services/statsService'
import { instanceManager } from '../services/instanceManager'
import { getSettings, saveSettings } from '../store/settingsStore'
import { listInstanceMetadata, loadInstanceMetadata, saveInstanceMetadata } from '../store/instancesStore'

export function registerDashboardIpcHandlers(): void {
  ipcMain.handle('stats:dashboard', () => collectDashboardStats())

  ipcMain.handle('groups:list', () => getSettings().serverGroups)

  ipcMain.handle('groups:create', async (_, name: string, color: string) => {
    const group: ServerGroup = { id: randomBytes(6).toString('hex'), name, color }
    const current = getSettings().serverGroups
    await saveSettings({ serverGroups: [...current, group] })
    return group
  })

  ipcMain.handle('groups:rename', async (_, id: string, name: string, color: string) => {
    const current = getSettings().serverGroups
    const next = current.map((g) => (g.id === id ? { ...g, name, color } : g))
    await saveSettings({ serverGroups: next })
    return next
  })

  ipcMain.handle('groups:delete', async (_, id: string) => {
    const current = getSettings().serverGroups
    await saveSettings({ serverGroups: current.filter((g) => g.id !== id) })

    // Detach the group from any server still pointing at it.
    for (const instance of await listInstanceMetadata()) {
      if (instance.groupId === id) await saveInstanceMetadata({ ...instance, groupId: null })
    }
  })

  ipcMain.handle('groups:assign', async (_, instanceId: string, groupId: string | null) => {
    const metadata = await loadInstanceMetadata(instanceId)
    await saveInstanceMetadata({ ...metadata, groupId })
  })

  /** Starts or stops every server in a group, skipping ones already in that state. */
  ipcMain.handle('groups:bulk', async (_, groupId: string, action: 'start' | 'stop') => {
    const instances = (await listInstanceMetadata()).filter((i) => i.groupId === groupId)
    const results = await Promise.allSettled(
      instances.map(async (instance) => {
        const status = instanceManager.getStatus(instance.id)
        if (action === 'start') {
          if (status !== 'stopped') return
          await instanceManager.startInstance(instance)
        } else {
          if (status === 'stopped') return
          await instanceManager.stopInstance(instance.id)
        }
      })
    )
    return {
      total: instances.length,
      failed: results.filter((r) => r.status === 'rejected').length
    }
  })
}
