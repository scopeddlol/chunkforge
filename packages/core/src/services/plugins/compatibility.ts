import type {
  CompatibilityVerdict,
  ContentPlatform,
  PluginSearchResult,
  ServerType
} from '../../types/index'

/**
 * Deciding whether a piece of content can run on a given server.
 *
 * The rules live here rather than in each provider because the question is
 * about the *server*, not the source: a Fabric mod is wrong for a Paper server
 * whether it came from Modrinth or CurseForge. Providers normalise what a
 * project supports; this decides what that means.
 *
 * The honest answer is sometimes "I don't know". Sources vary in what they
 * publish at search time, and a verdict that guesses confidently is worse than
 * one that admits uncertainty — hiding a compatible plugin because a source
 * omitted its version list would be a worse bug than showing it unflagged.
 * Hence `certain`, and why filtering only ever removes results we are sure
 * about.
 */

/** Everything a server accepts, widest first. */
const PLATFORMS_BY_SERVER: Record<ServerType, ContentPlatform[]> = {
  // Bukkit-family servers run each other's plugins: Paper runs Spigot and
  // Bukkit plugins, Purpur runs Paper's. Listing the ancestry rather than just
  // the server's own name is what stops a Paper server hiding most of Spigot's
  // catalogue, which is the bulk of what exists.
  paper: ['paper', 'spigot', 'bukkit', 'folia'],
  purpur: ['purpur', 'paper', 'spigot', 'bukkit', 'folia'],
  spigot: ['spigot', 'bukkit'],
  fabric: ['fabric', 'quilt'],
  forge: ['forge'],
  // NeoForge forked from Forge and still runs a good deal of it, but the split
  // is real enough that a Forge-only mod is a maybe, not a yes. Treated as
  // supported here and reported as uncertain below.
  neoforge: ['neoforge', 'forge'],
  vanilla: []
}

export function platformsForServer(serverType: ServerType): ContentPlatform[] {
  return PLATFORMS_BY_SERVER[serverType] ?? []
}

/** The server this browser is comparing against. */
export interface CompatibilityTarget {
  serverType: ServerType
  minecraftVersion: string
}

/**
 * Normalises the many spellings sources use into one platform id. Unknown
 * strings return null rather than a guess, so they read as "no information"
 * instead of silently becoming a wrong platform.
 */
export function toPlatform(raw: string): ContentPlatform | null {
  const value = raw.trim().toLowerCase()
  switch (value) {
    case 'paper':
    case 'papermc':
      return 'paper'
    case 'spigot':
    case 'spigotmc':
      return 'spigot'
    case 'purpur':
      return 'purpur'
    case 'bukkit':
    case 'craftbukkit':
      return 'bukkit'
    case 'folia':
      return 'folia'
    case 'velocity':
      return 'velocity'
    case 'waterfall':
    case 'bungeecord':
      return 'waterfall'
    case 'fabric':
      return 'fabric'
    case 'forge':
      return 'forge'
    case 'neoforge':
      return 'neoforge'
    case 'quilt':
      return 'quilt'
    default:
      return null
  }
}

/**
 * Whether a version string covers a target version.
 *
 * Sources are loose here: a project may advertise `1.21`, `1.21.x`, or a range
 * like `1.20-1.21.1`. Exact match first, then the common shorthands. Anything
 * stranger is left to the caller's uncertainty handling rather than parsed
 * speculatively — a wrong range parse silently hides working content.
 */
export function versionMatches(advertised: string, target: string): boolean {
  const a = advertised.trim()
  if (!a || !target) return false
  if (a === target) return true

  // `1.21.x` / `1.21.*`
  const wildcard = a.match(/^(\d+\.\d+)(?:\.[x*])?$/i)
  if (wildcard) {
    const base = wildcard[1]
    return target === base || target.startsWith(`${base}.`)
  }

  // Snapshot and pre-release names never match a release target.
  return false
}

export function anyVersionMatches(advertised: string[] | undefined, target: string): boolean {
  return Boolean(advertised?.some((v) => versionMatches(v, target)))
}

/**
 * Judges one result against a server.
 *
 * Both halves — platform and game version — are only decided when the source
 * actually said something. A missing list yields an uncertain pass, which is
 * why `certain` exists and why `hideIncompatible` uses it.
 */
export function judgeCompatibility(
  result: Pick<PluginSearchResult, 'platforms' | 'gameVersions' | 'kind'>,
  target: CompatibilityTarget
): CompatibilityVerdict {
  const accepted = platformsForServer(target.serverType)

  // A vanilla server runs no plugins or mods at all. Saying so plainly beats
  // an empty result list the user has to interpret.
  if (accepted.length === 0 && result.kind !== 'modpack') {
    return { compatible: false, certain: true, reason: 'Vanilla servers cannot load plugins or mods' }
  }

  if (result.platforms?.length) {
    const overlap = result.platforms.filter((p) => accepted.includes(p))
    if (overlap.length === 0) {
      return {
        compatible: false,
        certain: true,
        reason: `${labelFor(result.platforms)} only`
      }
    }
    // Forge content on NeoForge is a genuine maybe, so it passes but is never
    // reported as certain — which keeps it visible under hideIncompatible.
    if (target.serverType === 'neoforge' && !overlap.includes('neoforge')) {
      return { compatible: true, certain: false, reason: 'Built for Forge; usually works on NeoForge' }
    }
  }

  if (result.gameVersions?.length && !anyVersionMatches(result.gameVersions, target.minecraftVersion)) {
    return {
      compatible: false,
      certain: true,
      reason: `No build for ${target.minecraftVersion}`
    }
  }

  const knewEverything = Boolean(result.platforms?.length) && Boolean(result.gameVersions?.length)
  return { compatible: true, certain: knewEverything }
}

function labelFor(platforms: ContentPlatform[]): string {
  const names = platforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
