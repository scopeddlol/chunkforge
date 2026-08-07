import type { JSX } from 'react'
import { makeStyles, tokens, Text, Badge, Button, Spinner } from '@fluentui/react-components'
import { Play20Filled, Stop20Filled } from '@fluentui/react-icons'
import { serverTypeLabels, type InstanceSummary, type ServerGroup } from '@shared/types'
import { StatusDot } from '../../components/StatusDot'
import { ServerThumbnail } from '../../components/ServerThumbnail'

const useStyles = makeStyles({
  table: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden'
  },
  head: {
    display: 'grid',
    gridTemplateColumns: '2.2fr 1fr 1fr 0.9fr 0.9fr 150px',
    gap: '12px',
    padding: '10px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2
  },
  headCell: {
    color: tokens.colorNeutralForeground4,
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '2.2fr 1fr 1fr 0.9fr 0.9fr 150px',
    gap: '12px',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover }
  },
  nameCell: { display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  actions: { display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' },
  groupPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '11px',
    color: tokens.colorNeutralForeground3
  },
  groupDot: { width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0 }
})

interface InstanceTableProps {
  instances: InstanceSummary[]
  groups: ServerGroup[]
  onOpen: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
}

export function InstanceTable({
  instances,
  groups,
  onOpen,
  onStart,
  onStop
}: InstanceTableProps): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.table}>
      <div className={styles.head}>
        <Text className={styles.headCell}>Server</Text>
        <Text className={styles.headCell}>Type</Text>
        <Text className={styles.headCell}>Status</Text>
        <Text className={styles.headCell}>Players</Text>
        <Text className={styles.headCell}>Memory</Text>
        <Text className={styles.headCell} style={{ textAlign: 'right' }}>
          Actions
        </Text>
      </div>

      {instances.map((instance) => {
        const isRunning = instance.status === 'running'
        const isBusy = instance.status === 'starting' || instance.status === 'stopping'
        const group = groups.find((g) => g.id === instance.groupId)

        return (
          <div
            key={instance.id}
            className={styles.row}
            onClick={() => onOpen(instance.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOpen(instance.id)
            }}
          >
            <div className={styles.nameCell}>
              <ServerThumbnail
                name={instance.name}
                serverType={instance.serverType}
                iconUrl={instance.iconDataUrl}
                size={28}
              />
              <div style={{ minWidth: 0 }}>
                <Text weight="semibold" className={styles.name} block>
                  {instance.name}
                </Text>
                {group && (
                  <span className={styles.groupPill}>
                    <span className={styles.groupDot} style={{ backgroundColor: group.color }} />
                    {group.name}
                  </span>
                )}
              </div>
            </div>

            <Badge appearance="tint" color="informative">
              {serverTypeLabels[instance.serverType]} {instance.minecraftVersion}
            </Badge>

            <StatusDot status={instance.status} />

            <Text size={200} className={styles.muted}>
              {isRunning ? `${instance.playersOnline}/${instance.maxPlayers}` : '—'}
            </Text>

            <Text size={200} className={styles.muted}>
              {(instance.ramAllocatedMb / 1024).toFixed(1)} GB
            </Text>

            <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
              {isBusy && <Spinner size="extra-tiny" />}
              <Button
                appearance={isRunning ? 'secondary' : 'primary'}
                size="small"
                disabled={isBusy}
                icon={isRunning ? <Stop20Filled /> : <Play20Filled />}
                onClick={() => (isRunning ? onStop(instance.id) : onStart(instance.id))}
              >
                {isRunning ? 'Stop' : 'Start'}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
