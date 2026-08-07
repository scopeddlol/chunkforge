import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '../../shared/types'
import { defaultAppSettings } from '../../shared/types'
import { chunkforgeRoot } from '../services/paths'

const SETTINGS_FILENAME = 'settings.json'

let cached: AppSettings | null = null

function settingsPath(): string {
  return join(chunkforgeRoot(), SETTINGS_FILENAME)
}

/** Synchronous so providers can read the API key without threading async through search. */
export function getSettings(): AppSettings {
  if (cached) return cached
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    cached = { ...defaultAppSettings, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    cached = { ...defaultAppSettings }
  }
  return cached
}

export async function loadSettings(): Promise<AppSettings> {
  const path = settingsPath()
  if (!existsSync(path)) {
    cached = { ...defaultAppSettings }
    return cached
  }
  try {
    const raw = await readFile(path, 'utf-8')
    cached = { ...defaultAppSettings, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    cached = { ...defaultAppSettings }
  }
  return cached
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...getSettings(), ...patch }
  await mkdir(chunkforgeRoot(), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  cached = next
  return next
}
