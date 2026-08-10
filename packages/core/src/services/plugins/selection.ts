import type { CompatibilityVerdict, PluginVersion, ServerType } from '../../types/index'
import { anyVersionMatches, platformsForServer, type CompatibilityTarget } from './compatibility'

/**
 * Picking the right *file*.
 *
 * Compatibility used to be judged only on a project — "Simple Voice Chat
 * supports Paper" — and the file was then whichever build happened to be
 * newest. For a project that ships eight loaders that is a coin flip, and it
 * is how a Purpur 1.21.10 server ended up with a 1.21.2 Fabric mod: the
 * project genuinely does support Paper, just not in the file that was taken.
 *
 * So the same question is asked again one level down, where it can actually be
 * answered, because a build knows exactly which loader and which Minecraft
 * versions it is for.
 */

/** How good a match a file is, best first. Ordering is the whole point. */
export enum MatchRank {
  /** Right loader, right Minecraft version. */
  Exact = 0,
  /** Right loader, and a version the file's line covers. */
  Compatible = 1,
  /** Plausible but unproven — the source did not say enough. */
  Unknown = 2,
  /** Ruled out. */
  Incompatible = 3
}

export interface JudgedVersion extends PluginVersion {
  compatibility: CompatibilityVerdict
  rank: MatchRank
}

/**
 * Judges one build against a server.
 *
 * Order matters: the loader is checked before the game version because
 * "Fabric only" is the more useful thing to be told. A Fabric build that also
 * happens to be for the wrong Minecraft version should not report the version
 * as the problem, because switching version would not help.
 */
export function judgeVersion(version: PluginVersion, target: CompatibilityTarget): CompatibilityVerdict {
  const accepted = platformsForServer(target.serverType)

  if (accepted.length === 0) {
    return { compatible: false, certain: true, reason: 'Vanilla servers cannot load plugins or mods' }
  }

  const declared = version.platforms ?? []
  if (declared.length > 0) {
    const overlap = declared.filter((p) => accepted.includes(p))
    if (overlap.length === 0) {
      return {
        compatible: false,
        certain: true,
        reason: `${labelFor(declared)} build`
      }
    }
    if (target.serverType === 'neoforge' && !overlap.includes('neoforge')) {
      return { compatible: true, certain: false, reason: 'Forge build; usually works on NeoForge' }
    }
  }

  if (version.gameVersions.length > 0 && !anyVersionMatches(version.gameVersions, target.minecraftVersion)) {
    return {
      compatible: false,
      certain: true,
      reason: `Built for ${summariseVersions(version.gameVersions)}, not ${target.minecraftVersion}`
    }
  }

  // A build that named neither is not a build we can vouch for. Saying so is
  // what keeps it out of the automatic pick without hiding it from someone who
  // knows better than the metadata does.
  const knewEverything = declared.length > 0 && version.gameVersions.length > 0
  return { compatible: true, certain: knewEverything }
}

function rankOf(version: PluginVersion, verdict: CompatibilityVerdict, target: CompatibilityTarget): MatchRank {
  if (!verdict.compatible) return MatchRank.Incompatible
  if (!verdict.certain) return MatchRank.Unknown
  return version.gameVersions.includes(target.minecraftVersion) ? MatchRank.Exact : MatchRank.Compatible
}

/**
 * How near a miss an already-rejected build is.
 *
 * Only matters for the list someone opens after being told nothing fits. A
 * build for the right loader and the wrong Minecraft version is the one they
 * want to see first — it is the project they were looking for, one version
 * out. A Fabric build on a Paper server is never going to be useful to them,
 * however recent it is.
 */
function nearness(version: PluginVersion, target: CompatibilityTarget): number {
  const accepted = platformsForServer(target.serverType)
  const declared = version.platforms ?? []
  if (declared.length === 0) return 1
  return declared.some((p) => accepted.includes(p)) ? 0 : 2
}

/**
 * Every build, judged and ordered so the first one is the one to install.
 *
 * Sorted by how good a match it is and only then by recency, which is the
 * inversion that fixes the original bug: newest-first put a brand new Fabric
 * build above a slightly older Paper one, and the installer took the top of
 * the list.
 */
export function judgeVersions(
  versions: PluginVersion[],
  target: CompatibilityTarget
): JudgedVersion[] {
  return versions
    .map((version) => {
      const compatibility = judgeVersion(version, target)
      return { ...version, compatibility, rank: rankOf(version, compatibility, target) }
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      // Among rejected builds, the near-misses are the useful ones.
      if (a.rank === MatchRank.Incompatible) {
        const near = nearness(a, target) - nearness(b, target)
        if (near !== 0) return near
      }
      // A build nobody can download is never the better of two equal matches.
      const downloadable = Number(Boolean(b.downloadUrl)) - Number(Boolean(a.downloadUrl))
      if (downloadable !== 0) return downloadable
      return recency(b) - recency(a)
    })
}

function recency(version: PluginVersion): number {
  const at = version.releasedAt ? Date.parse(version.releasedAt) : NaN
  return Number.isNaN(at) ? 0 : at
}

/**
 * The build to install, or null when none of them will do.
 *
 * Never returns a merely-plausible build when a proven one exists, and never
 * returns one that is ruled out. Returning null is a real answer: the caller
 * is expected to explain rather than fall back to installing something.
 */
export function bestVersion(
  versions: PluginVersion[],
  target: CompatibilityTarget
): JudgedVersion | null {
  const judged = judgeVersions(versions, target)
  const usable = judged.find((v) => v.rank !== MatchRank.Incompatible && v.downloadUrl)
  return usable ?? null
}

/**
 * Why nothing could be installed, in terms of what the project does offer.
 *
 * "No compatible version" on its own sends someone to a wiki. Naming the
 * loaders and versions that *do* exist usually answers the question on the
 * spot — most often "this is a Fabric mod and yours is a Paper server".
 */
export function explainNoMatch(versions: PluginVersion[], target: CompatibilityTarget): string {
  if (versions.length === 0) return 'This project has no downloadable builds.'

  const accepted = platformsForServer(target.serverType)
  if (accepted.length === 0) {
    return 'A vanilla server cannot load plugins or mods. Switch it to Paper, Purpur, Fabric or Forge first.'
  }

  const platforms = [...new Set(versions.flatMap((v) => v.platforms ?? []))]
  const rightPlatform = versions.filter(
    (v) => (v.platforms ?? []).length === 0 || (v.platforms ?? []).some((p) => accepted.includes(p))
  )

  if (platforms.length > 0 && rightPlatform.length === 0) {
    return `This is a ${labelFor(platforms)} project, and this server runs ${labelFor(accepted.slice(0, 2))}.`
  }

  /**
   * Only reach for the version explanation when the version is actually the
   * problem. Checking `rightPlatform` alone said "there is no 1.21.10 build"
   * while listing 1.21.10 among the closest — the builds were right and merely
   * undownloadable, which is a different sentence entirely.
   */
  const rightVersion = rightPlatform.filter(
    (v) => v.gameVersions.length === 0 || anyVersionMatches(v.gameVersions, target.minecraftVersion)
  )
  if (rightVersion.length === 0) {
    const offered = [...new Set(rightPlatform.flatMap((v) => v.gameVersions))]
    if (offered.length > 0) {
      return `There is no ${target.minecraftVersion} build. The closest are ${summariseVersions(offered)}.`
    }
    return `Nothing here matches ${target.serverType} ${target.minecraftVersion}.`
  }

  // Right loader, right version, still nothing installable: the files exist but
  // the source will not hand them over.
  if (rightVersion.every((v) => !v.downloadUrl)) {
    return 'This project is not distributed through the API and has to be downloaded from its own site.'
  }

  return `Nothing here matches ${target.serverType} ${target.minecraftVersion}.`
}

/** Whether a server can load anything at all. */
export function acceptsContent(serverType: ServerType): boolean {
  return platformsForServer(serverType).length > 0
}

function labelFor(platforms: string[]): string {
  const names = [...new Set(platforms)].map((p) => p.charAt(0).toUpperCase() + p.slice(1))
  if (names.length === 0) return 'unknown'
  if (names.length === 1) return names[0]
  if (names.length > 3) return `${names.slice(0, 3).join(', ')} and others`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Newest few versions, so a long list reads as a summary rather than a dump. */
function summariseVersions(versions: string[]): string {
  const sorted = [...new Set(versions)].sort(compareGameVersions).reverse().slice(0, 3)
  return sorted.join(', ')
}

/** Numeric comparison, so 1.21.10 sorts above 1.21.9 rather than below it. */
export function compareGameVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10))
  const pb = b.split('.').map((n) => Number.parseInt(n, 10))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isNaN(pa[i]) ? -1 : (pa[i] ?? -1)
    const y = Number.isNaN(pb[i]) ? -1 : (pb[i] ?? -1)
    if (x !== y) return x - y
  }
  return 0
}
