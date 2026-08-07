import { EventEmitter } from 'events'
import type { BackupSchedule } from '../../shared/types'
import { createBackup, deleteBackup, listBackups } from './backupsService'
import { listInstanceMetadata, loadInstanceMetadata } from '../store/instancesStore'

const MINUTE_MS = 60_000

/**
 * Runs scheduled world backups. A single timer ticks every minute and fires any
 * instance whose interval has elapsed, rather than one timer per instance —
 * schedules change often and per-instance timers leak easily.
 */
class BackupScheduler extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private lastRun = new Map<string, number>()
  private running = new Set<string>()

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, MINUTE_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Called when a schedule changes so the next tick uses fresh timing. */
  reset(instanceId: string): void {
    this.lastRun.delete(instanceId)
  }

  private async tick(): Promise<void> {
    let instances: Awaited<ReturnType<typeof listInstanceMetadata>>
    try {
      instances = await listInstanceMetadata()
    } catch {
      return
    }

    const now = Date.now()
    for (const instance of instances) {
      const schedule = instance.backupSchedule
      if (!schedule?.enabled || schedule.intervalHours <= 0) continue
      if (this.running.has(instance.id)) continue

      const dueAfter = schedule.intervalHours * 60 * MINUTE_MS
      const last = this.lastRun.get(instance.id) ?? schedule.lastRunAt ?? 0
      if (now - last < dueAfter) continue

      this.lastRun.set(instance.id, now)
      void this.runBackup(instance.id, schedule)
    }
  }

  async runBackup(instanceId: string, schedule: BackupSchedule): Promise<void> {
    this.running.add(instanceId)
    try {
      const metadata = await loadInstanceMetadata(instanceId)
      const created = await createBackup(metadata.path)
      this.emit('backup-created', { instanceId, filename: created.filename })

      if (schedule.keepCount > 0) {
        const all = await listBackups(metadata.path)
        for (const stale of all.slice(schedule.keepCount)) {
          await deleteBackup(metadata.path, stale.filename)
        }
      }

      if (schedule.uploadToFileHub) {
        this.emit('upload-requested', { instanceId, filename: created.filename })
      }
    } catch (err) {
      this.emit('backup-failed', { instanceId, message: (err as Error).message })
    } finally {
      this.running.delete(instanceId)
    }
  }
}

export const backupScheduler = new BackupScheduler()
