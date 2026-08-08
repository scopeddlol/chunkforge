import {
  defaultToggles,
  type CreateInstanceConfig,
  type InstanceToggles,
  type QueuedPlugin,
  type SelectedModpack,
  type ServerType
} from '@shared/types'

export interface WizardState {
  serverType: ServerType
  minecraftVersion: string
  name: string
  accentColor: string
  port: number
  minRamMb: number
  maxRamMb: number
  toggles: InstanceToggles
  /**
   * Which machine builds and runs this server. `local` is this one; anything
   * else is a node adopted through Portal, and the whole creation happens
   * there.
   */
  nodeId: string
  /**
   * Subdomain label requested for a server on a node, e.g. `survival`. Empty
   * means Portal derives one from the server's name, which is the default for
   * most servers.
   */
  subdomainLabel: string
  installLocation: string | null
  enableGeyser: boolean
  groupId: string | null
  initialPlugins: QueuedPlugin[]
  /** Chosen on the first step; swaps the loader picker for a modpack picker. */
  useModpack: boolean
  /** When set, the server is created from this modpack instead of a bare loader. */
  modpack: SelectedModpack | null
}

export type WizardStepKey =
  | 'type'
  | 'modpack'
  | 'version'
  | 'name'
  | 'resources'
  | 'toggles'
  | 'addons'
  | 'review'

const STEP_LABELS: Record<WizardStepKey, string> = {
  type: 'Server Type',
  modpack: 'Modpack',
  version: 'Version',
  name: 'Name & Location',
  resources: 'Resources & Network',
  toggles: 'Toggles',
  addons: 'Add-Ons',
  review: 'Review & Create'
}

/**
 * The step list depends on the chosen path: a modpack supplies both the loader
 * and its mods, so it replaces the version picker and the add-ons step.
 */
export function buildSteps(state: WizardState): WizardStepKey[] {
  if (state.useModpack) {
    return ['type', 'modpack', 'name', 'resources', 'toggles', 'review']
  }
  return ['type', 'version', 'name', 'resources', 'toggles', 'addons', 'review']
}

export function stepLabel(key: WizardStepKey): string {
  return STEP_LABELS[key]
}

export const accentSwatches = [
  '#8B5CF6', // brand violet (default)
  '#2EBD59', // emerald
  '#3E9CF2', // sky blue
  '#E0459C', // magenta
  '#E0475E', // ember red
  '#E0C22E' // gold
]

export function createInitialWizardState(defaults?: {
  defaultPort: number
  defaultMinRamMb: number
  defaultMaxRamMb: number
  defaultInstallLocation: string | null
}): WizardState {
  return {
    serverType: 'paper',
    minecraftVersion: '',
    name: '',
    accentColor: accentSwatches[0],
    port: defaults?.defaultPort ?? 25565,
    minRamMb: defaults?.defaultMinRamMb ?? 2048,
    maxRamMb: defaults?.defaultMaxRamMb ?? 4096,
    toggles: { ...defaultToggles },
    nodeId: 'local',
    subdomainLabel: '',
    installLocation: defaults?.defaultInstallLocation ?? null,
    enableGeyser: false,
    groupId: null,
    initialPlugins: [],
    useModpack: false,
    modpack: null
  }
}

export function toCreateInstanceConfig(state: WizardState): CreateInstanceConfig {
  const { serverType, minecraftVersion, name, accentColor, port, minRamMb, maxRamMb, toggles, installLocation, enableGeyser, groupId, initialPlugins, modpack, nodeId, subdomainLabel } = state
  return {
    serverType,
    minecraftVersion,
    name,
    accentColor,
    port,
    minRamMb,
    maxRamMb,
    toggles,
    // An install path is this machine's concept. A node picks its own location
    // inside its data volume, so sending ours would be meaningless there.
    installLocation: nodeId === 'local' ? installLocation : null,
    enableGeyser,
    groupId,
    initialPlugins,
    modpack,
    nodeId,
    // Meaningless for a local server — there is no Portal route to name.
    subdomainLabel: nodeId === 'local' ? undefined : subdomainLabel.trim() || undefined
  }
}
