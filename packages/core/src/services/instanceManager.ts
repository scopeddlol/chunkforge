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
} from '../types/index'
import { LAUNCH_TOKENS } from '../types/index'
import { ensureJavaRuntime } from './javaManager'
import { acquireServer } from './jarAcquisition'
import { defaultLaunchArgs, installGeyser } from './loaders'
import { resolveServerRequirements } from './minecraftVersions'
import { renderEula, renderServerProperties } from './serverProperties'
import { resolveInstanceDir, saveInstanceMetadata, slugifyInstanceName } from '../store/instancesStore'

interface RunningProcess {
  child: ChildProcessWithoutNullStreams
  expectedStop: boolean
  players: Set<string>
}

// Vanilla/Paper log lines look like:
//   [12:00:00] [Server thread/INFO]: Steve joined the game
const JOIN_PATTERN = /\]: ([A-Za-z0-9_]{1,16}) joined the game/
const LEAVE_PATTERN = /\]: ([A-Za-z0-9_]{1,16}) left the game/

class InstanceManager extends EventEmitter {
  private running = new Map<string, RunningProcess>()

  getStatus(id: string): InstanceStatus {
    return this.running.has(id) ? 'running' : 'stopped'
  }

  getOnlinePlayers(id: string): string[] {
    return [...(this.running.get(id)?.players ?? [])]
  }

  private trackPlayers(instanceId: string, text: string): void {
    const entry = this.running.get(instanceId)
    if (!entry) return

    let changed = false
    for (const line of text.split('\n')) {
      const joined = line.match(JOIN_PATTERN)
      if (joined) {
        entry.players.add(joined[1])
        changed = true
        continue
      }
      const left = line.match(LEAVE_PATTERN)
      if (left) {
        entry.players.delete(left[1])
        changed = true
      }
    }

    if (changed) this.emit('players-changed', { instanceId, players: [...entry.players] })
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

    const isSlowBuild = config.serverType === 'spigot'
    const acquireMessage = isSlowBuild
      ? 'Compiling Spigot with BuildTools — this takes several minutes…'
      : `Downloading ${config.serverType} ${config.minecraftVersion}…`

    this.emitProgress({ instanceId: id, stage: 'downloading-server', message: acquireMessage, percent: 0 })
    const acquired = await acquireServer(
      config.serverType,
      config.minecraftVersion,
      dir,
      javaPath,
      requirements.jvmFlags,
      (percent) => {
        this.emitProgress({ instanceId: id, stage: 'downloading-server', message: acquireMessage, percent })
      }
    )

    if (config.enableGeyser) {
      this.emitProgress({
        instanceId: id,
        stage: 'downloading-server',
        message: 'Installing Geyser and Floodgate for Bedrock crossplay…',
        percent: null
      })
      await installGeyser(dir)
    }

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
      exposedPorts: config.exposedPorts ?? [
        {
          id: 'minecraft-default',
          label: 'Minecraft',
          protocol: 'tcp',
          targetPort: config.port,
          publicPort: config.port,
          host: '',
          enabled: true
        },
        {
          id: 'minecraft-query',
          label: 'Minecraft Query',
          protocol: 'udp',
          targetPort: config.port,
          publicPort: config.port,
          host: '',
          enabled: false
        }
      ],
      javaMajor: majorJava,
      jvmFlags: requirements.jvmFlags,
      launchArgs: acquired.launchArgs ?? defaultLaunchArgs(config.serverType, requirements.jvmFlags),
      groupId: config.groupId ?? null
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

    // Older instances predate launchArgs; fall back to the classic -jar form.
    const template = metadata.launchArgs ?? [
      `-Xms${LAUNCH_TOKENS.minRam}M`,
      `-Xmx${LAUNCH_TOKENS.maxRam}M`,
      ...(metadata.jvmFlags ?? []),
      '-jar',
      'server.jar',
      'nogui'
    ]
    const args = template.map((arg) =>
      arg
        .replaceAll(LAUNCH_TOKENS.minRam, String(metadata.minRamMb))
        .replaceAll(LAUNCH_TOKENS.maxRam, String(metadata.maxRamMb))
    )
    const child = spawn(metadata.javaPath, args, { cwd: metadata.path })

    const entry: RunningProcess = { child, expectedStop: false, players: new Set() }
    this.running.set(metadata.id, entry)

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      this.emitLog(metadata.id, 'stdout', text)
      this.trackPlayers(metadata.id, text)
      if (/Done \(.+\)! For help, type "help"/.test(text)) {
        this.emitStatus(metadata.id, 'running')
      }
    })
    child.stderr.on('data', (chunk: Buffer) => this.emitLog(metadata.id, 'stderr', chunk.toString()))

    child.on('close', (code) => {
      this.running.delete(metadata.id)
      this.emit('players-changed', { instanceId: metadata.id, players: [] })
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
