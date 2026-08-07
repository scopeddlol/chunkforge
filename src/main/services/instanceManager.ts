import { EventEmitter } from 'events'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type {
  CreateInstanceConfig,
  CreateProgressEvent,
  InstanceMetadata,
  InstanceStatus,
  LogLineEvent,
  StatusChangedEvent
} from '../../shared/types'
import { ensureJavaRuntime } from './javaManager'
import { downloadServerJar } from './jarAcquisition'
import { resolveServerRequirements } from './minecraftVersions'
import { renderEula, renderServerProperties } from './serverProperties'
import { resolveInstanceDir, saveInstanceMetadata, slugifyInstanceName } from '../store/instancesStore'

interface RunningProcess {
  child: ChildProcessWithoutNullStreams
  expectedStop: boolean
}

class InstanceManager extends EventEmitter {
  private running = new Map<string, RunningProcess>()

  getStatus(id: string): InstanceStatus {
    return this.running.has(id) ? 'running' : 'stopped'
  }

  private emitLog(instanceId: string, stream: LogLineEvent['stream'], line: string): void {
    const event: LogLineEvent = { instanceId, stream, line, timestamp: Date.now() }
    this.emit('log', event)
  }

  private emitStatus(instanceId: string, status: InstanceStatus): void {
    const event: StatusChangedEvent = { instanceId, status }
    this.emit('status-changed', event)
  }

  private emitProgress(event: CreateProgressEvent): void {
    this.emit('create-progress', event)
  }

  async createInstance(config: CreateInstanceConfig): Promise<InstanceMetadata> {
    const id = slugifyInstanceName(config.name)
    const dir = resolveInstanceDir(id, config.installLocation)

    this.emitProgress({ instanceId: id, stage: 'preparing', message: 'Setting up server folder…', percent: null })
    await mkdir(dir, { recursive: true })

    this.emitProgress({
      instanceId: id,
      stage: 'resolving-java',
      message: 'Checking Java requirements…',
      percent: null
    })
    const requirements = await resolveServerRequirements(config.serverType, config.minecraftVersion)
    const majorJava = requirements.javaMajor

    const javaPath = await ensureJavaRuntime(majorJava, (progress) => {
      if (progress.stage === 'downloading') {
        this.emitProgress({
          instanceId: id,
          stage: 'downloading-java',
          message: `Downloading Java ${majorJava} runtime…`,
          percent: progress.percent
        })
      } else if (progress.stage === 'extracting') {
        this.emitProgress({
          instanceId: id,
          stage: 'downloading-java',
          message: `Installing Java ${majorJava} runtime…`,
          percent: null
        })
      }
    })

    this.emitProgress({
      instanceId: id,
      stage: 'downloading-server',
      message: `Downloading ${config.serverType} ${config.minecraftVersion}…`,
      percent: 0
    })
    await downloadServerJar(config.serverType, config.minecraftVersion, dir, (percent) => {
      this.emitProgress({
        instanceId: id,
        stage: 'downloading-server',
        message: `Downloading ${config.serverType} ${config.minecraftVersion}…`,
        percent
      })
    })

    this.emitProgress({ instanceId: id, stage: 'accepting-eula', message: 'Accepting Minecraft EULA…', percent: null })
    await writeFile(join(dir, 'eula.txt'), renderEula(), 'utf-8')
    await writeFile(join(dir, 'server.properties'), renderServerProperties(config.port, config.toggles), 'utf-8')

    const metadata: InstanceMetadata = {
      id,
      name: config.name,
      serverType: config.serverType,
      minecraftVersion: config.minecraftVersion,
      status: 'stopped',
      playersOnline: 0,
      maxPlayers: 20,
      ramAllocatedMb: config.maxRamMb,
      accentColor: config.accentColor,
      createdAt: new Date().toISOString(),
      port: config.port,
      javaPath,
      minRamMb: config.minRamMb,
      maxRamMb: config.maxRamMb,
      eulaAccepted: true,
      path: dir,
      toggles: config.toggles,
      javaMajor: majorJava,
      jvmFlags: requirements.jvmFlags
    }
    await saveInstanceMetadata(metadata)

    this.emitProgress({ instanceId: id, stage: 'done', message: 'Server created.', percent: 100 })
    return metadata
  }

  /**
   * Re-resolves the Java runtime and JVM flags before launch. Requirements are
   * read live from the upstream project, so an instance created against an
   * outdated guess repairs itself instead of failing with a class-version error.
   */
  private async healJavaRuntime(metadata: InstanceMetadata): Promise<InstanceMetadata> {
    let javaMajor = metadata.javaMajor
    let jvmFlags = metadata.jvmFlags

    if (javaMajor === undefined || jvmFlags === undefined) {
      const requirements = await resolveServerRequirements(metadata.serverType, metadata.minecraftVersion)
      javaMajor = requirements.javaMajor
      jvmFlags = requirements.jvmFlags
    }

    const javaPath = await ensureJavaRuntime(javaMajor, (progress) => {
      if (progress.stage === 'downloading') {
        this.emitLog(metadata.id, 'system', `Downloading Java ${javaMajor} runtime… ${progress.percent ?? 0}%\n`)
      }
    })

    if (javaPath === metadata.javaPath && javaMajor === metadata.javaMajor && jvmFlags === metadata.jvmFlags) {
      return metadata
    }

    const healed: InstanceMetadata = { ...metadata, javaPath, javaMajor, jvmFlags }
    await saveInstanceMetadata(healed)
    return healed
  }

  async startInstance(input: InstanceMetadata): Promise<void> {
    if (this.running.has(input.id)) return

    this.emitStatus(input.id, 'starting')

    let metadata: InstanceMetadata
    try {
      metadata = await this.healJavaRuntime(input)
    } catch (err) {
      this.emitLog(input.id, 'system', `Failed to prepare Java runtime: ${(err as Error).message}\n`)
      this.emitStatus(input.id, 'crashed')
      return
    }

    if (!metadata.javaPath) {
      this.emitLog(metadata.id, 'system', 'No Java runtime resolved for this instance\n')
      this.emitStatus(metadata.id, 'crashed')
      return
    }

    const args = [
      `-Xms${metadata.minRamMb}M`,
      `-Xmx${metadata.maxRamMb}M`,
      ...(metadata.jvmFlags ?? []),
      '-jar',
      'server.jar',
      'nogui'
    ]
    const child = spawn(metadata.javaPath, args, { cwd: metadata.path })

    const entry: RunningProcess = { child, expectedStop: false }
    this.running.set(metadata.id, entry)

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      this.emitLog(metadata.id, 'stdout', text)
      if (/Done \(.+\)! For help, type "help"/.test(text)) {
        this.emitStatus(metadata.id, 'running')
      }
    })
    child.stderr.on('data', (chunk: Buffer) => this.emitLog(metadata.id, 'stderr', chunk.toString()))

    child.on('close', (code) => {
      this.running.delete(metadata.id)
      const status: InstanceStatus = entry.expectedStop || code === 0 ? 'stopped' : 'crashed'
      this.emitStatus(metadata.id, status)
    })

    child.on('error', (err) => {
      this.emitLog(metadata.id, 'system', `Failed to start server process: ${err.message}`)
      this.running.delete(metadata.id)
      this.emitStatus(metadata.id, 'crashed')
    })
  }

  async stopInstance(id: string, timeoutMs = 30_000): Promise<void> {
    const entry = this.running.get(id)
    if (!entry) return

    entry.expectedStop = true
    this.emitStatus(id, 'stopping')
    entry.child.stdin.write('stop\n')

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.running.has(id)) entry.child.kill()
      }, timeoutMs)
      entry.child.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  sendCommand(id: string, command: string): void {
    const entry = this.running.get(id)
    if (!entry) throw new Error('Server is not running')
    entry.child.stdin.write(`${command}\n`)
  }
}

export const instanceManager = new InstanceManager()
