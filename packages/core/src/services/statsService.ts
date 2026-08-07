import os from 'os'
import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import type { DashboardStats } from '../types/index'
import { listInstanceMetadata } from '../store/instancesStore'
import { instanceManager } from './instanceManager'

interface CpuSample {
  idle: number
  total: number
}

function sampleCpu(): CpuSample {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value
    idle += cpu.times.idle
  }
  return { idle, total }
}

// CPU usage is a delta between samples, so the previous one is kept across calls.
let previousSample: CpuSample | null = null

function cpuUsagePercent(): number {
  const current = sampleCpu()
  if (!previousSample) {
    previousSample = current
    return 0
  }
  const idleDelta = current.idle - previousSample.idle
  const totalDelta = current.total - previousSample.total
  previousSample = current
  if (totalDelta <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)))
}

async function directorySize(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0
  let total = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      try {
        total += (await stat(full)).size
      } catch {
        // Files can vanish mid-walk while a server is running.
      }
    }
  }
  return total
}

export async function collectDashboardStats(): Promise<DashboardStats> {
  const instances = await listInstanceMetadata()

  let backupCount = 0
  let backupBytes = 0
  let diskBytes = 0

  for (const instance of instances) {
    const backupsDir = join(instance.path, 'chunkforge-backups')
    if (existsSync(backupsDir)) {
      try {
        const entries = await readdir(backupsDir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith('.zip')) continue
          backupCount++
          backupBytes += (await stat(join(backupsDir, entry.name))).size
        }
      } catch {
        // Unreadable backup folder just contributes nothing.
      }
    }
    diskBytes += await directorySize(instance.path)
  }

  const running = instances.filter((i) => instanceManager.getStatus(i.id) === 'running')
  const playersOnline = instances.reduce(
    (sum, i) => sum + instanceManager.getOnlinePlayers(i.id).length,
    0
  )

  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()

  return {
    cpuPercent: cpuUsagePercent(),
    totalMemoryBytes: totalMemory,
    usedMemoryBytes: totalMemory - freeMemory,
    // What the running servers are permitted to use, not their live RSS —
    // reading per-process memory for JVMs is unreliable on Windows.
    allocatedMemoryBytes: running.reduce((sum, i) => sum + i.maxRamMb * 1024 * 1024, 0),
    serverCount: instances.length,
    runningCount: running.length,
    playersOnline,
    backupCount,
    backupBytes,
    diskBytes,
    cpuCores: os.cpus().length,
    uptimeSeconds: os.uptime()
  }
}
