import { defaultToggles, type CreateInstanceConfig, type InstanceToggles, type ServerType } from '@shared/types'

export interface WizardState {
  serverType: ServerType
  minecraftVersion: string
  name: string
  accentColor: string
  port: number
  minRamMb: number
  maxRamMb: number
  toggles: InstanceToggles
  installLocation: string | null
}

export const wizardSteps = [
  'Server Type',
  'Version',
  'Name & Location',
  'Resources & Network',
  'Toggles',
  'Plugins',
  'Review & Create'
] as const

export const accentSwatches = [
  '#8B5CF6', // brand violet (default)
  '#2EBD59', // emerald
  '#3E9CF2', // sky blue
  '#E0459C', // magenta
  '#E0475E', // ember red
  '#E0C22E' // gold
]

export function createInitialWizardState(): WizardState {
  return {
    serverType: 'paper',
    minecraftVersion: '',
    name: '',
    accentColor: accentSwatches[0],
    port: 25565,
    minRamMb: 2048,
    maxRamMb: 4096,
    toggles: { ...defaultToggles },
    installLocation: null
  }
}

export function toCreateInstanceConfig(state: WizardState): CreateInstanceConfig {
  const { serverType, minecraftVersion, name, accentColor, port, minRamMb, maxRamMb, toggles, installLocation } =
    state
  return { serverType, minecraftVersion, name, accentColor, port, minRamMb, maxRamMb, toggles, installLocation }
}
