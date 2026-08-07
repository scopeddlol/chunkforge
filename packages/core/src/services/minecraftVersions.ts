import type { ServerType } from '../types/index'

function parseVersion(version: string): number[] {
  return version
    .split('.')
    .map((part) => parseInt(part.replace(/\D.*$/, ''), 10))
    .map((n) => (Number.isNaN(n) ? 0 : n))
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Offline fallback only. Minecraft raises its Java requirement over time, so
 * this table goes stale — {@link resolveServerRequirements} asks the upstream
 * APIs first and only falls back here when they can't be reached.
 */
export function requiredJavaMajorFallback(minecraftVersion: string): number {
  if (compareVersions(minecraftVersion, '25.0') >= 0) return 25
  if (compareVersions(minecraftVersion, '1.20.5') >= 0) return 21
  if (compareVersions(minecraftVersion, '1.17') >= 0) return 17
  return 8
}

export interface ServerRequirements {
  javaMajor: number
  /** Server-recommended JVM tuning flags, when the upstream project publishes them. */
  jvmFlags: string[]
}

interface MojangManifest {
  versions: Array<{ id: string; url: string }>
}

interface MojangVersionDetail {
  javaVersion?: { majorVersion?: number }
}

interface PaperVersionDetail {
  version?: {
    java?: {
      version?: { minimum?: number }
      flags?: { recommended?: string[] }
    }
  }
}

const MOJANG_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const PAPER_API_BASE = 'https://fill.papermc.io/v3/projects/paper'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`)
  return response.json() as Promise<T>
}

async function resolveVanillaRequirements(version: string): Promise<ServerRequirements> {
  const manifest = await fetchJson<MojangManifest>(MOJANG_MANIFEST_URL)
  const entry = manifest.versions.find((v) => v.id === version)
  if (!entry) throw new Error(`Unknown Minecraft version: ${version}`)
  const detail = await fetchJson<MojangVersionDetail>(entry.url)
  const javaMajor = detail.javaVersion?.majorVersion
  if (!javaMajor) throw new Error(`Mojang did not report a Java version for ${version}`)
  return { javaMajor, jvmFlags: [] }
}

async function resolvePaperRequirements(version: string): Promise<ServerRequirements> {
  const detail = await fetchJson<PaperVersionDetail>(`${PAPER_API_BASE}/versions/${version}`)
  const javaMajor = detail.version?.java?.version?.minimum
  if (!javaMajor) throw new Error(`Paper did not report a Java version for ${version}`)
  return { javaMajor, jvmFlags: detail.version?.java?.flags?.recommended ?? [] }
}

/**
 * Asks the upstream project what Java version a server build actually needs,
 * rather than inferring it from the Minecraft version number.
 */
export async function resolveServerRequirements(
  serverType: ServerType,
  version: string
): Promise<ServerRequirements> {
  try {
    switch (serverType) {
      case 'paper':
        return await resolvePaperRequirements(version)
      case 'purpur':
      case 'spigot':
        // Purpur is a Paper fork and Spigot tracks the same Minecraft builds,
        // so Paper's published minimum is authoritative for both. Neither
        // publishes Paper's tuning flags, so those aren't inherited.
        return { javaMajor: (await resolvePaperRequirements(version)).javaMajor, jvmFlags: [] }
      case 'vanilla':
      case 'forge':
      case 'neoforge':
      case 'fabric':
        // Mod loaders run the same Minecraft server underneath, so Mojang's
        // declared Java version applies.
        return await resolveVanillaRequirements(version)
      default:
        return { javaMajor: requiredJavaMajorFallback(version), jvmFlags: [] }
    }
  } catch {
    return { javaMajor: requiredJavaMajorFallback(version), jvmFlags: [] }
  }
}
