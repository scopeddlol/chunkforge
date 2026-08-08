import type { GameVersionOption } from '../../types/index'
import { fetchJson } from './provider'

/**
 * The Minecraft versions the content browser offers to filter by.
 *
 * Deliberately not derived from any one content source. Each of them
 * advertises a different slice — Hangar knows what Paper supports, CurseForge
 * what its own files target — so building the dropdown from a source would
 * make the list change depending on which tab you were on. Mojang's own
 * manifest is the one list that is the same everywhere, and it is what a user
 * means when they pick "1.21.1".
 *
 * Cached for the process's lifetime: the manifest changes a handful of times a
 * year, and the dropdown opens far more often than that.
 */

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: Array<{ id: string; type: string; releaseTime: string }>
}

let cached: GameVersionOption[] | null = null

/**
 * Releases only, newest first. Snapshots are excluded because almost nothing
 * in the catalogues targets them, so offering them would mostly produce empty
 * results that look like a broken filter.
 */
export async function listGameVersions(): Promise<GameVersionOption[]> {
  if (cached) return cached
  const manifest = await fetchJson<Manifest>(MANIFEST_URL)
  const releases = manifest.versions.filter((version) => version.type === 'release')
  cached = releases.map((version) => ({
    id: version.id,
    isLatest: version.id === manifest.latest.release
  }))
  return cached
}
