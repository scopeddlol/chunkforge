import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { PlayerEntry } from '../../shared/types'

interface JsonPlayerRef {
  uuid?: string
  name?: string
}

async function readPlayerList(instancePath: string, filename: string): Promise<JsonPlayerRef[]> {
  const path = join(instancePath, filename)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8'))
    return Array.isArray(parsed) ? (parsed as JsonPlayerRef[]) : []
  } catch {
    // A malformed or half-written list shouldn't break the Players tab.
    return []
  }
}

/**
 * Merges the server's own ops/whitelist/ban files with the live online set so
 * the UI shows one row per player regardless of which list they appear in.
 */
export async function listPlayers(instancePath: string, onlineNames: string[]): Promise<PlayerEntry[]> {
  const [ops, whitelist, banned] = await Promise.all([
    readPlayerList(instancePath, 'ops.json'),
    readPlayerList(instancePath, 'whitelist.json'),
    readPlayerList(instancePath, 'banned-players.json')
  ])

  const byName = new Map<string, PlayerEntry>()

  const upsert = (name: string | undefined, uuid: string | null, patch: Partial<PlayerEntry>): void => {
    if (!name) return
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      byName.set(key, { ...existing, ...patch, uuid: existing.uuid ?? uuid })
      return
    }
    byName.set(key, {
      name,
      uuid,
      online: false,
      op: false,
      whitelisted: false,
      banned: false,
      ...patch
    })
  }

  for (const entry of ops) upsert(entry.name, entry.uuid ?? null, { op: true })
  for (const entry of whitelist) upsert(entry.name, entry.uuid ?? null, { whitelisted: true })
  for (const entry of banned) upsert(entry.name, entry.uuid ?? null, { banned: true })
  for (const name of onlineNames) upsert(name, null, { online: true })

  return [...byName.values()].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
