import type { InstanceMetadata, Project } from '../types/index'
import { DEFAULT_PROJECT_ID, LOCAL_NODE_ID } from '../types/models'
import { listInstanceMetadata, saveInstanceMetadata } from './instancesStore'
import { getSettings, saveSettings } from './settingsStore'

/**
 * Current on-disk generation.
 *
 * 1 — original single-machine records (no explicit generation stamp).
 * 2 — every instance carries a project and a node, so a server's owner and its
 *     location are separable. This is the prerequisite for remote nodes and for
 *     migrating a server between them.
 */
export const CURRENT_SCHEMA_VERSION = 2

export interface MigrationReport {
  instancesMigrated: number
  projectsCreated: number
}

/**
 * Brings an existing install up to the current schema. Safe to run on every
 * boot: records already at the current generation are skipped, and it is
 * additive — no field an older build reads is removed, so downgrading does not
 * strand anyone.
 */
export async function runMigrations(): Promise<MigrationReport> {
  const report: MigrationReport = { instancesMigrated: 0, projectsCreated: 0 }

  report.projectsCreated = await ensureProjects()

  for (const metadata of await listInstanceMetadata()) {
    if ((metadata.schemaVersion ?? 1) >= CURRENT_SCHEMA_VERSION) continue
    await saveInstanceMetadata(migrateInstance(metadata))
    report.instancesMigrated += 1
  }

  return report
}

/** Pure record upgrade, kept separate so it is trivially testable. */
export function migrateInstance(metadata: InstanceMetadata): InstanceMetadata {
  return {
    ...metadata,
    // A server that belonged to a group joins the project that group became;
    // everything else lands in the default project.
    projectId: metadata.projectId ?? metadata.groupId ?? DEFAULT_PROJECT_ID,
    nodeId: metadata.nodeId ?? LOCAL_NODE_ID,
    schemaVersion: CURRENT_SCHEMA_VERSION
  }
}

/**
 * Projects supersede server groups. Each existing group becomes a project with
 * the same id, so instance references stay valid without rewriting them, and a
 * default project is added for servers that were never grouped.
 */
async function ensureProjects(): Promise<number> {
  const settings = getSettings()
  const existing = settings.projects ?? []
  const byId = new Map(existing.map((p) => [p.id, p]))
  let created = 0

  for (const group of settings.serverGroups ?? []) {
    if (byId.has(group.id)) continue
    byId.set(group.id, {
      id: group.id,
      name: group.name,
      color: group.color,
      createdAt: new Date().toISOString()
    })
    created += 1
  }

  if (!byId.has(DEFAULT_PROJECT_ID)) {
    byId.set(DEFAULT_PROJECT_ID, {
      id: DEFAULT_PROJECT_ID,
      name: 'My Servers',
      color: '#8B5CF6',
      createdAt: new Date().toISOString(),
      isDefault: true
    })
    created += 1
  }

  if (created > 0) {
    const projects: Project[] = [...byId.values()]
    await saveSettings({ projects })
  }
  return created
}
