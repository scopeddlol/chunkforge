import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Title2,
  Button,
  Badge,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  ToggleButton,
  mergeClasses
} from '@fluentui/react-components'
import {
  AddCircle24Regular,
  Grid20Regular,
  AppsList20Regular,
  Play20Filled,
  Stop20Filled,
  MoreHorizontal20Regular
} from '@fluentui/react-icons'
import type { DashboardView, ServerGroup } from '@shared/types'
import { ChunkforgeMark } from '../../components/ChunkforgeMark'
import { useInstancesStore } from '../../state/instancesStore'
import { useConfirmStop } from '../../components/ConfirmStopDialog'
import { InstanceCard } from './InstanceCard'
import { InstanceTable } from './InstanceTable'
import { AnalyticsPanel } from './AnalyticsPanel'
import { GroupDialog } from './GroupDialog'

const useStyles = makeStyles({
  root: { flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '28px 36px', overflow: 'auto' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '20px'
  },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  headerActions: { display: 'flex', gap: '8px', alignItems: 'center' },
  viewToggle: { display: 'flex', gap: '2px' },
  groupBar: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' },
  groupChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px 4px 8px',
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    cursor: 'pointer',
    fontSize: '12px',
    fontFamily: 'inherit',
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover }
  },
  groupChipActive: {
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke1}`,
    color: tokens.colorNeutralForeground1
  },
  groupDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' },
  emptyState: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '18px',
    textAlign: 'center',
    padding: '48px',
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`
  },
  markBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '84px',
    height: '84px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground2,
    marginBottom: '4px'
  },
  emptyBody: { color: tokens.colorNeutralForeground3, maxWidth: '360px', lineHeight: '20px' }
})

interface DashboardPageProps {
  onOpenWizard: () => void
  onOpenInstance: (id: string) => void
}

export function DashboardPage({ onOpenWizard, onOpenInstance }: DashboardPageProps): JSX.Element {
  const styles = useStyles()
  const { instances, loaded, refresh, applyStatus } = useInstancesStore()
  const { requestStop, dialog: confirmStopDialog } = useConfirmStop()

  const [view, setView] = useState<DashboardView>('grid')
  const [groups, setGroups] = useState<ServerGroup[]>([])
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)

  const loadGroups = useCallback(() => {
    window.chunkforge.groups.list().then(setGroups)
  }, [])

  useEffect(() => {
    refresh()
    loadGroups()
    window.chunkforge.settings.get().then((s) => setView(s.dashboardView))
  }, [refresh, loadGroups])

  useEffect(() => {
    return window.chunkforge.servers.onStatusChanged((event) =>
      applyStatus(event.instanceId, event.status)
    )
  }, [applyStatus])

  async function changeView(next: DashboardView): Promise<void> {
    setView(next)
    await window.chunkforge.settings.update({ dashboardView: next })
  }

  function handleStart(id: string): void {
    window.chunkforge.servers.start(id)
  }

  function handleStop(id: string): void {
    const instance = instances.find((i) => i.id === id)
    requestStop(id, instance?.name ?? 'this server')
  }

  async function bulk(groupId: string, action: 'start' | 'stop'): Promise<void> {
    await window.chunkforge.groups.bulk(groupId, action)
    refresh()
  }

  const visible = useMemo(
    () => (activeGroup ? instances.filter((i) => i.groupId === activeGroup) : instances),
    [instances, activeGroup]
  )

  const hasInstances = instances.length > 0

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <Title2>Your Servers</Title2>
          <Text className={styles.subtitle} block>
            Forge Your World.
          </Text>
        </div>
        {hasInstances && (
          <div className={styles.headerActions}>
            <div className={styles.viewToggle}>
              <ToggleButton
                appearance="subtle"
                size="small"
                icon={<Grid20Regular />}
                checked={view === 'grid'}
                onClick={() => changeView('grid')}
                title="Card view"
              />
              <ToggleButton
                appearance="subtle"
                size="small"
                icon={<AppsList20Regular />}
                checked={view === 'table'}
                onClick={() => changeView('table')}
                title="Table view"
              />
            </div>
            <Button appearance="primary" icon={<AddCircle24Regular />} onClick={onOpenWizard}>
              New Server
            </Button>
          </div>
        )}
      </div>

      {hasInstances && <AnalyticsPanel />}

      {hasInstances && (
        <div className={styles.groupBar}>
          <button
            type="button"
            className={mergeClasses(styles.groupChip, activeGroup === null && styles.groupChipActive)}
            onClick={() => setActiveGroup(null)}
          >
            All servers
            <Badge appearance="tint" size="small">
              {instances.length}
            </Badge>
          </button>

          {groups.map((group) => {
            const count = instances.filter((i) => i.groupId === group.id).length
            const active = activeGroup === group.id
            return (
              <div key={group.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <button
                  type="button"
                  className={mergeClasses(styles.groupChip, active && styles.groupChipActive)}
                  onClick={() => setActiveGroup(active ? null : group.id)}
                >
                  <span className={styles.groupDot} style={{ backgroundColor: group.color }} />
                  {group.name}
                  <Badge appearance="tint" size="small">
                    {count}
                  </Badge>
                </button>
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} />
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem icon={<Play20Filled />} onClick={() => bulk(group.id, 'start')}>
                        Start all in group
                      </MenuItem>
                      <MenuItem icon={<Stop20Filled />} onClick={() => bulk(group.id, 'stop')}>
                        Stop all in group
                      </MenuItem>
                      <MenuItem
                        onClick={async () => {
                          await window.chunkforge.groups.delete(group.id)
                          setActiveGroup(null)
                          loadGroups()
                          refresh()
                        }}
                      >
                        Delete group
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </div>
            )
          })}

          <Button appearance="subtle" size="small" onClick={() => setGroupDialogOpen(true)}>
            + Group
          </Button>
        </div>
      )}

      {loaded && hasInstances && view === 'grid' && (
        <div className={styles.grid}>
          {visible.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              onOpen={onOpenInstance}
              onStart={handleStart}
              onStop={handleStop}
            />
          ))}
        </div>
      )}

      {loaded && hasInstances && view === 'table' && (
        <InstanceTable
          instances={visible}
          groups={groups}
          onOpen={onOpenInstance}
          onStart={handleStart}
          onStop={handleStop}
        />
      )}

      {loaded && !hasInstances && (
        <div className={styles.emptyState}>
          <div className={styles.markBadge}>
            <ChunkforgeMark size={40} />
          </div>
          <Title2>No servers yet</Title2>
          <Text className={styles.emptyBody}>
            Spin up a Vanilla, Paper, Purpur, Spigot, Forge, Fabric, or NeoForge server in a few clicks —
            pick a version, tune your settings, and add plugins before the first boot.
          </Text>
          <Button appearance="primary" icon={<AddCircle24Regular />} size="large" onClick={onOpenWizard}>
            Create Your First Server
          </Button>
        </div>
      )}

      <GroupDialog
        open={groupDialogOpen}
        instances={instances}
        onClose={() => setGroupDialogOpen(false)}
        onSaved={() => {
          loadGroups()
          refresh()
        }}
      />

      {confirmStopDialog}
    </div>
  )
}
