import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '../types/index'
import { defaultAppSettings } from '../types/index'
import { LOCAL_NODE_ID } from '../types/models'
import { chunkforgeRoot } from '../services/paths'

const SETTINGS_FILENAME = 'settings.json'

let cached: AppSettings | null = null

function settingsPath(): string {
  return join(chunkforgeRoot(), SETTINGS_FILENAME)
}

/**
 * Merges saved settings over the defaults. Nested groups are merged one level
 * deep so a settings.json written by an older build — which won't contain newer
 * groups like `fileHub` at all — still yields a fully-populated object rather
 * than an undefined the UI would crash on.
 */
function withDefaults(saved: Partial<AppSettings>): AppSettings {
  const mergedNodes = (saved.nodes ?? defaultAppSettings.nodes).map((node) => ({
    ...node,
    status: node.status ?? (node.id === LOCAL_NODE_ID ? 'online' : 'offline')
  }))
  const nodes = mergedNodes.some((node) => node.id === LOCAL_NODE_ID)
    ? mergedNodes
    : [...mergedNodes, defaultAppSettings.nodes[0]]
  return {
    ...defaultAppSettings,
    ...saved,
    nodes,
    portal: { ...defaultAppSettings.portal, ...(saved.portal ?? {}) },
    fileHub: { ...defaultAppSettings.fileHub, ...(saved.fileHub ?? {}) }
  }
}

/** Synchronous so providers can read the API key without threading async through search. */
export function getSettings(): AppSettings {
  if (cached) return cached
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    cached = withDefaults(JSON.parse(raw) as Partial<AppSettings>)
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
    cached = withDefaults(JSON.parse(raw) as Partial<AppSettings>)
  } catch {
    cached = { ...defaultAppSettings }
  }
  return cached
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = getSettings()
  const next: AppSettings = {
    ...current,
    ...patch,
    portal: { ...current.portal, ...(patch.portal ?? {}) },
    fileHub: { ...current.fileHub, ...(patch.fileHub ?? {}) }
  }
  await mkdir(chunkforgeRoot(), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  cached = next
  return next
}
