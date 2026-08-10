import type {
  ContentDependency,
  ContentKind,
  PluginSearchResult,
  PluginSource,
  PluginVersion
} from '../../types/index'
import type { CompatibilityTarget } from './compatibility'
import { bestVersion, explainNoMatch } from './selection'
import type { PluginProvider } from './provider'

/**
 * Working out everything an install actually entails.
 *
 * Installing one mod is rarely installing one file. It may need a library that
 * is a separate project, it may refuse to sit beside something already there,
 * and it may be a client mod that does nothing on a server at all. None of
 * that is visible from a search result, and finding out by starting the server
 * and reading a crash log is the experience this replaces.
 *
 * The answer is computed before anything is written, so a plan can be shown,
 * refused, or applied as a whole rather than half-applied and abandoned.
 */

/** Something the user should know before the files land. */
export interface InstallWarning {
  kind: 'client-only' | 'conflict' | 'unresolved-dependency' | 'unknown-side'
  message: string
  projectId?: string
  /** Set when the warning is severe enough that installing is a mistake. */
  blocking: boolean
}

export interface PlannedInstall {
  source: PluginSource
  projectId: string
  name: string
  version: PluginVersion
  /** False for the project the user actually asked for. */
  isDependency: boolean
}

export interface InstallPlan {
  /** Everything to download, the requested project first. */
  install: PlannedInstall[]
  warnings: InstallWarning[]
  /** Set when the requested project itself has no usable build. */
  reason?: string
}

/** Sources are looked up through this so the resolver stays testable. */
export type ProviderLookup = (source: PluginSource) => PluginProvider

const MAX_DEPTH = 4

/**
 * Whether a project can run on a server at all.
 *
 * `server_side: unsupported` is a definite no — a shader or a minimap does
 * nothing in a server jar, and on a modpack it is a crash. Everything else,
 * including `unknown`, is allowed: the field is often unset on older projects,
 * and refusing those would block far more working content than it saved.
 */
export function isClientOnly(project: Pick<PluginSearchResult, 'serverSide' | 'clientSide'>): boolean {
  return project.serverSide === 'unsupported'
}

/**
 * Builds the full plan for installing one project.
 *
 * Dependencies are followed transitively but breadth-first and depth-capped: a
 * cycle in the graph is a real possibility and an unbounded walk would hang on
 * one. A dependency that cannot be resolved is a warning rather than a
 * failure, because a missing optional library is usually harmless and the
 * server's own logs are a better judge than a package index.
 */
export async function planInstall(
  source: PluginSource,
  projectId: string,
  target: CompatibilityTarget,
  lookup: ProviderLookup,
  options: { kind?: ContentKind; installed?: string[] } = {}
): Promise<InstallPlan> {
  const warnings: InstallWarning[] = []
  const install: PlannedInstall[] = []
  const seen = new Set<string>([key(source, projectId)])

  const root = await resolveOne(source, projectId, target, lookup, options.kind)
  if (!root.version) {
    return { install: [], warnings, reason: root.reason }
  }

  if (root.project && isClientOnly(root.project)) {
    warnings.push({
      kind: 'client-only',
      projectId,
      blocking: true,
      message: `${root.project.name} is a client-side mod. Installing it on a server does nothing, and on a modded server it can stop it starting.`
    })
  }

  install.push({
    source,
    projectId,
    name: root.project?.name ?? projectId,
    version: root.version,
    isDependency: false
  })

  // Breadth-first, so the first level of dependencies is resolved before any
  // of their own — which is the order they matter in if the walk is cut short.
  let frontier: Array<{ from: PlannedInstall; deps: ContentDependency[] }> = [
    { from: install[0], deps: root.version.dependencies ?? [] }
  ]

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const next: typeof frontier = []

    for (const { from, deps } of frontier) {
      for (const dep of deps) {
        // Already inside the jar: installing it again is how two copies of a
        // library end up on the classpath.
        if (dep.kind === 'embedded') continue

        if (dep.kind === 'incompatible') {
          const conflicting = (options.installed ?? []).find((name) =>
            name.toLowerCase().includes(dep.projectId.toLowerCase())
          )
          if (conflicting) {
            warnings.push({
              kind: 'conflict',
              projectId: dep.projectId,
              blocking: true,
              message: `${from.name} cannot run alongside ${conflicting}.`
            })
          }
          continue
        }

        if (dep.kind === 'optional') continue
        if (seen.has(key(dep.source ?? source, dep.projectId))) continue
        seen.add(key(dep.source ?? source, dep.projectId))

        const resolved = await resolveOne(
          dep.source ?? source,
          dep.projectId,
          target,
          lookup,
          options.kind
        )
        if (!resolved.version) {
          warnings.push({
            kind: 'unresolved-dependency',
            projectId: dep.projectId,
            blocking: false,
            message: `${from.name} needs ${resolved.project?.name ?? dep.projectId}, which has no build for ${target.serverType} ${target.minecraftVersion}.`
          })
          continue
        }

        const planned: PlannedInstall = {
          source: dep.source ?? source,
          projectId: dep.projectId,
          name: resolved.project?.name ?? dep.projectId,
          version: resolved.version,
          isDependency: true
        }
        install.push(planned)
        next.push({ from: planned, deps: resolved.version.dependencies ?? [] })
      }
    }

    frontier = next
  }

  return { install, warnings }
}

/** One project's best build plus whatever the source knows about the project. */
async function resolveOne(
  source: PluginSource,
  projectId: string,
  target: CompatibilityTarget,
  lookup: ProviderLookup,
  kind?: ContentKind
): Promise<{ version: PluginVersion | null; project: PluginSearchResult | null; reason?: string }> {
  const provider = lookup(source)
  if (!provider || !provider.isAvailable()) {
    return { version: null, project: null, reason: `${source} is not configured.` }
  }

  // The project lookup is best-effort: it supplies a display name and the
  // client/server split, and a source that cannot answer should not stop the
  // build from being resolved.
  const project = provider.getProject
    ? await provider.getProject(projectId, kind).catch(() => null)
    : null

  let versions: PluginVersion[]
  try {
    versions = await provider.listVersions(projectId, {
      gameVersion: target.minecraftVersion,
      kind: kind ?? project?.kind
    })
  } catch (err) {
    return { version: null, project, reason: (err as Error).message }
  }

  const best = bestVersion(versions, target)
  return {
    version: best,
    project,
    reason: best ? undefined : explainNoMatch(versions, target)
  }
}

function key(source: PluginSource, projectId: string): string {
  return `${source}:${projectId}`
}

/**
 * Mods already installed that have no business being on a server.
 *
 * Answered from filenames, because that is all an installed jar leaves behind
 * — Chunkforge does not record which project a file came from once it is on
 * disk. So this matches names against the projects a caller supplies rather
 * than guessing, and says nothing when it cannot tell.
 */
export function clientOnlyInstalled(
  filenames: string[],
  known: Array<Pick<PluginSearchResult, 'name' | 'serverSide' | 'clientSide'>>
): Array<{ filename: string; name: string }> {
  const clientOnly = known.filter(isClientOnly)
  const found: Array<{ filename: string; name: string }> = []
  for (const filename of filenames) {
    const canonical = filename.toLowerCase().replace(/[^a-z0-9]+/g, '')
    const match = clientOnly.find((project) =>
      canonical.includes(project.name.toLowerCase().replace(/[^a-z0-9]+/g, ''))
    )
    if (match) found.push({ filename, name: match.name })
  }
  return found
}
