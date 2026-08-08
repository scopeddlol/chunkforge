import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { hostname } from 'os'
import { dirname, join } from 'path'

/**
 * What this machine needs to know to be a node.
 *
 * Kept beside the node's data rather than in Electron's userData, because the
 * data directory is the thing an operator actually chooses and backs up — the
 * worlds, the jars, and the pairing all belonging together is what makes
 * "move the node to a bigger disk" a copy rather than a re-pair.
 */
export interface NodeConfig {
  portalUrl: string
  /** Only needed until the first successful pairing; the token supersedes it. */
  pairingPin: string
  nodeName: string
  dataRoot: string
  /** Start with Windows. On by default — a node nobody restarts is not a node. */
  autoStart: boolean
}

export function defaultConfig(defaultDataRoot: string): NodeConfig {
  return {
    portalUrl: '',
    pairingPin: '',
    nodeName: hostname(),
    dataRoot: defaultDataRoot,
    autoStart: true
  }
}

export async function loadConfig(configPath: string, defaultDataRoot: string): Promise<NodeConfig> {
  if (!existsSync(configPath)) return defaultConfig(defaultDataRoot)
  try {
    const saved = JSON.parse(await readFile(configPath, 'utf-8')) as Partial<NodeConfig>
    return { ...defaultConfig(defaultDataRoot), ...saved }
  } catch {
    // A mangled config should present the setup window, not refuse to launch.
    return defaultConfig(defaultDataRoot)
  }
}

export async function saveConfig(configPath: string, config: NodeConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Whether this node has ever paired. The node worker writes this file after a
 * successful redemption, so its presence is what lets the tray start without
 * asking for a pin again.
 */
export function hasPaired(dataRoot: string): boolean {
  return existsSync(join(dataRoot, 'node-identity.json'))
}

/** Enough to try starting: a Portal, and either a pin or an existing pairing. */
export function isConfigured(config: NodeConfig): boolean {
  if (!config.portalUrl.trim()) return false
  return Boolean(config.pairingPin.trim()) || hasPaired(config.dataRoot)
}
