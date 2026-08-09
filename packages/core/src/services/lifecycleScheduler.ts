import { EventEmitter } from 'events'
import type { InstanceMetadata, ServerLifecycle } from '../types/index'
import { defaultBackupContents } from '../types/index'
import { instanceManager } from './instanceManager'
import { createBackup } from './backupsService'
import { listInstanceMetadata } from '../store/instancesStore'

const MINUTE_MS = 60_000

/**
 * Runs the rules that start, stop and restart servers on their own.
 *
 * One timer ticking every minute rather than a timer per rule per server:
 * schedules change whenever someone edits a server, and per-rule timers are
 * how you end up with two of them firing after a rename.
 *
 * The rules can contradict each other, so precedence is decided here, once,
 * in the order below. Reading it top to bottom is the whole specification:
 *
 *   1. **Scheduled stop** wins over everything. If an operator said "not after
 *      11pm", nothing else may start it at 11:01.
 *   2. **Scheduled start** brings a stopped server up in its window.
 *   3. **Sleep** stops an empty server, but never inside a start window — the
 *      two would otherwise fight, stopping and starting every minute.
 *   4. **Restart** applies only to a server that is already running and has
 *      been up long enough.
 *
 * Everything is best-effort. A rule that throws is logged against the server
 * and skipped; one server's bad state must never stop the tick that serves
 * every other server.
 */
class LifecycleScheduler extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  /** When each server was last started by anyone, for the restart interval. */
  private startedAt = new Map<string, number>()
  /** When each server was last seen with nobody on it. */
  private emptySince = new Map<string, number>()
  /** Guards against a slow action being started twice by consecutive ticks. */
  private working = new Set<string>()
  /** Stops a daily rule firing repeatedly across the minute it matches. */
  private firedToday = new Map<string, string>()

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, MINUTE_MS)
    this.timer.unref?.()

    // Learned from the manager rather than from whoever pressed the button,
    // so a restart interval measures from when the server actually came up —
    // including starts this scheduler did not cause.
    instanceManager.on('status-changed', ({ instanceId, status }: { instanceId: string; status: string }) => {
      if (status === 'running') this.noteStarted(instanceId)
      else if (status === 'stopped' || status === 'crashed') this.noteStopped(instanceId)
    })
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Called when a server starts, so restart intervals measure from the truth. */
  noteStarted(instanceId: string): void {
    this.startedAt.set(instanceId, Date.now())
    this.emptySince.delete(instanceId)
  }

  noteStopped(instanceId: string): void {
    this.startedAt.delete(instanceId)
    this.emptySince.delete(instanceId)
  }

  private async tick(now = Date.now()): Promise<void> {
    let instances: InstanceMetadata[]
    try {
      instances = await listInstanceMetadata()
    } catch {
      return
    }
    for (const instance of instances) {
      if (this.working.has(instance.id)) continue
      const lifecycle = instance.lifecycle
      if (!lifecycle || Object.keys(lifecycle).length === 0) continue
      try {
        await this.applyTo(instance, lifecycle, now)
      } catch (err) {
        // Deliberately not 'error': Node treats that name specially and
        // throws when nothing is listening, so a scheduled action failing on
        // a host that had not wired up a listener would take the process down
        // rather than log a line.
        this.emit('action-failed', { instanceId: instance.id, message: (err as Error).message })
      }
    }
  }

  private async applyTo(
    instance: InstanceMetadata,
    lifecycle: ServerLifecycle,
    now: number
  ): Promise<void> {
    const running = instanceManager.getStatus(instance.id) === 'running'
    const clock = localHhMm(now)

    // 1. Scheduled stop — the strongest rule, so nothing restarts into a window
    //    the operator closed.
    if (lifecycle.stopAt && clock === lifecycle.stopAt && this.firstTimeToday(instance.id, 'stop', now)) {
      if (running) await this.run(instance.id, 'Scheduled stop', () => instanceManager.stopInstance(instance.id))
      return
    }

    // 2. Scheduled start.
    if (lifecycle.startAt && clock === lifecycle.startAt && this.firstTimeToday(instance.id, 'start', now)) {
      if (!running) await this.run(instance.id, 'Scheduled start', () => instanceManager.startInstance(instance))
      return
    }

    if (!running) return

    // 3. Sleep when empty — suppressed inside a start window so the two rules
    //    do not take turns undoing each other.
    if (lifecycle.sleepAfterEmptyMinutes && lifecycle.sleepAfterEmptyMinutes > 0) {
      const players = instanceManager.getOnlinePlayers(instance.id).length
      if (players > 0) {
        this.emptySince.delete(instance.id)
      } else {
        const since = this.emptySince.get(instance.id) ?? now
        this.emptySince.set(instance.id, since)
        const emptyMinutes = (now - since) / MINUTE_MS
        if (emptyMinutes >= lifecycle.sleepAfterEmptyMinutes && !inStartWindow(lifecycle, clock)) {
          await this.run(instance.id, 'Sleeping after inactivity', () =>
            instanceManager.stopInstance(instance.id)
          )
          return
        }
      }
    }

    // 4. Automatic restart, measured from when this server actually started.
    if (lifecycle.restartEveryHours && lifecycle.restartEveryHours > 0) {
      const started = this.startedAt.get(instance.id)
      if (started === undefined) {
        // First tick since the panel came up. Anchor rather than restart
        // immediately, which would punish a panel restart with a server restart.
        this.startedAt.set(instance.id, now)
        return
      }
      const upHours = (now - started) / (60 * MINUTE_MS)
      if (upHours >= lifecycle.restartEveryHours) {
        if (lifecycle.maintenanceBackups) {
          await this.run(instance.id, 'Maintenance backup and restart', async () => {
            // Stopped first so the archive is a consistent snapshot rather than
            // a world mid-write, which is the entire reason to take it down.
            await instanceManager.stopInstance(instance.id)
            try {
              await createBackup(
                instance.path,
                instance.backupSchedule?.contents ?? defaultBackupContents
              )
            } catch (err) {
              // The server comes back regardless. A backup that could not be
              // taken is a problem worth reporting; a server left off all night
              // because of it is a worse one.
              this.emit('action-failed', {
                instanceId: instance.id,
                message: `Maintenance backup failed, restarting anyway: ${(err as Error).message}`
              })
            } finally {
              await instanceManager.startInstance(instance)
            }
          })
        } else {
          await this.run(instance.id, 'Scheduled restart', () =>
            instanceManager.restartInstance(instance)
          )
        }
        this.startedAt.set(instance.id, Date.now())
      }
    }
  }

  /** Runs one action, reporting it, and never letting two overlap per server. */
  private async run(instanceId: string, reason: string, action: () => Promise<void>): Promise<void> {
    this.working.add(instanceId)
    this.emit('action', { instanceId, reason })
    try {
      await action()
    } finally {
      this.working.delete(instanceId)
    }
  }

  /**
   * True the first time a named daily rule matches on a given date.
   *
   * A tick every minute against an `HH:MM` would otherwise fire for as long as
   * the clock reads that minute, and a slow action can straddle it.
   */
  private firstTimeToday(instanceId: string, rule: string, now: number): boolean {
    const key = `${instanceId}:${rule}`
    const today = new Date(now).toDateString()
    if (this.firedToday.get(key) === today) return false
    this.firedToday.set(key, today)
    return true
  }
}

/** Local `HH:MM`, matching how the schedule is written. */
function localHhMm(now: number): string {
  const date = new Date(now)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * Whether the clock is inside the server's scheduled running hours.
 *
 * Handles a window that crosses midnight — "start 18:00, stop 02:00" is an
 * evening server, not an empty range — because reading it the naive way would
 * make sleep fight the schedule every night.
 */
export function inStartWindow(lifecycle: ServerLifecycle, clock: string): boolean {
  const { startAt, stopAt } = lifecycle
  if (!startAt || !stopAt) return false
  if (startAt === stopAt) return false
  if (startAt < stopAt) return clock >= startAt && clock < stopAt
  return clock >= startAt || clock < stopAt
}

export const lifecycleScheduler = new LifecycleScheduler()

/** Exposed for tests: runs one tick at a chosen moment. */
export async function runLifecycleTick(now: number): Promise<void> {
  await (lifecycleScheduler as unknown as { tick: (now: number) => Promise<void> }).tick(now)
}
