import type { JSX } from 'react'
import { makeStyles, tokens, Text, Badge, Button } from '@fluentui/react-components'
import { Play24Filled, Stop24Filled } from '@fluentui/react-icons'
import type { InstanceSummary } from '@shared/types'
import { StatusDot } from '../../components/StatusDot'

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    // Native buttons don't inherit color; without this the card text renders black.
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    textAlign: 'left',
    transitionProperty: 'border-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      border: `1px solid ${tokens.colorNeutralStroke1}`
    }
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  accent: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0
  },
  name: {
    flexGrow: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '4px'
  }
})

interface InstanceCardProps {
  instance: InstanceSummary
  onOpen: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
}

export function InstanceCard({ instance, onOpen, onStart, onStop }: InstanceCardProps): JSX.Element {
  const styles = useStyles()
  const isRunning = instance.status === 'running' || instance.status === 'starting'
  const isBusy = instance.status === 'starting' || instance.status === 'stopping'

  return (
    <button className={styles.card} onClick={() => onOpen(instance.id)} type="button">
      <div className={styles.header}>
        <span className={styles.accent} style={{ backgroundColor: instance.accentColor }} />
        <Text weight="semibold" className={styles.name}>
          {instance.name}
        </Text>
      </div>

      <div className={styles.meta}>
        <Badge appearance="tint" color="informative">
          {instance.serverType} {instance.minecraftVersion}
        </Badge>
        <Text size={200}>
          {instance.playersOnline}/{instance.maxPlayers}
        </Text>
      </div>

      <div className={styles.footer}>
        <StatusDot status={instance.status} />
        <Button
          appearance="subtle"
          size="small"
          disabled={isBusy}
          icon={isRunning ? <Stop24Filled /> : <Play24Filled />}
          onClick={(e) => {
            e.stopPropagation()
            if (isRunning) onStop(instance.id)
            else onStart(instance.id)
          }}
        >
          {isRunning ? 'Stop' : 'Start'}
        </Button>
      </div>
    </button>
  )
}
