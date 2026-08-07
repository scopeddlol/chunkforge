import type { JSX } from 'react'
import { makeStyles, tokens, Text, Badge, Button, Spinner } from '@fluentui/react-components'
import { Play20Filled, Stop20Filled, Options20Regular } from '@fluentui/react-icons'
import type { InstanceSummary } from '@shared/types'
import { StatusDot } from '../../components/StatusDot'
import { statusColors } from '../../theme/chunkforgeTheme'

const useStyles = makeStyles({
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '18px',
    paddingLeft: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    transitionProperty: 'border-color, background-color',
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveEasyEase,
    ':hover': {
      border: `1px solid ${tokens.colorBrandStroke1}`,
      backgroundColor: tokens.colorNeutralBackground1Hover
    }
  },
  // Accent stripe doubles as the instance's colour identity.
  accentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3px'
  },
  header: { display: 'flex', alignItems: 'center', gap: '10px' },
  name: {
    flexGrow: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '15px'
  },
  metaRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '10px',
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`
  },
  stat: { display: 'flex', flexDirection: 'column', gap: '1px' },
  statLabel: { color: tokens.colorNeutralForeground4, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  statValue: { color: tokens.colorNeutralForeground2 },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  actions: { display: 'flex', gap: '4px', alignItems: 'center' }
})

interface InstanceCardProps {
  instance: InstanceSummary
  onOpen: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
}

export function InstanceCard({ instance, onOpen, onStart, onStop }: InstanceCardProps): JSX.Element {
  const styles = useStyles()
  const isRunning = instance.status === 'running'
  const isBusy = instance.status === 'starting' || instance.status === 'stopping'

  return (
    <div className={styles.card} onClick={() => onOpen(instance.id)} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(instance.id) }}>
      <span
        className={styles.accentStripe}
        style={{ backgroundColor: isRunning ? statusColors.running : instance.accentColor }}
      />

      <div className={styles.header}>
        <Text weight="semibold" className={styles.name}>
          {instance.name}
        </Text>
        <StatusDot status={instance.status} />
      </div>

      <div className={styles.metaRow}>
        <Badge appearance="tint" color="informative">
          {instance.serverType}
        </Badge>
        <Badge appearance="outline" color="informative">
          {instance.minecraftVersion}
        </Badge>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <Text className={styles.statLabel}>Players</Text>
          <Text size={300} className={styles.statValue}>
            {isRunning ? `${instance.playersOnline} / ${instance.maxPlayers}` : '—'}
          </Text>
        </div>
        <div className={styles.stat}>
          <Text className={styles.statLabel}>Memory</Text>
          <Text size={300} className={styles.statValue}>
            {(instance.ramAllocatedMb / 1024).toFixed(1)} GB
          </Text>
        </div>
        <div className={styles.stat}>
          <Text className={styles.statLabel}>Created</Text>
          <Text size={300} className={styles.statValue}>
            {new Date(instance.createdAt).toLocaleDateString()}
          </Text>
        </div>
      </div>

      <div className={styles.footer}>
        <Button
          appearance="subtle"
          size="small"
          icon={<Options20Regular />}
          onClick={(e) => {
            e.stopPropagation()
            onOpen(instance.id)
          }}
        >
          Manage
        </Button>
        <div className={styles.actions}>
          {isBusy && <Spinner size="extra-tiny" />}
          <Button
            appearance={isRunning ? 'secondary' : 'primary'}
            size="small"
            disabled={isBusy}
            icon={isRunning ? <Stop20Filled /> : <Play20Filled />}
            onClick={(e) => {
              e.stopPropagation()
              if (isRunning) onStop(instance.id)
              else onStart(instance.id)
            }}
          >
            {isRunning ? 'Stop' : 'Start'}
          </Button>
        </div>
      </div>
    </div>
  )
}
