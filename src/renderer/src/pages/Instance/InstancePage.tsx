import { useEffect, useState, type JSX } from 'react'
import { makeStyles, tokens, Text, Title2, Button, Spinner } from '@fluentui/react-components'
import { ArrowLeft24Regular, Play24Filled, Stop24Filled } from '@fluentui/react-icons'
import type { InstanceMetadata, InstanceStatus } from '@shared/types'
import { StatusDot } from '../../components/StatusDot'
import { ConsoleView } from '../../components/ConsoleView'
import { useInstancesStore } from '../../state/instancesStore'

const useStyles = makeStyles({
  root: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    padding: '20px 36px 28px'
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '18px'
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: tokens.colorNeutralForeground3
  },
  loading: {
    flexGrow: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
})

interface InstancePageProps {
  instanceId: string
  onBack: () => void
}

export function InstancePage({ instanceId, onBack }: InstancePageProps): JSX.Element {
  const styles = useStyles()
  const [metadata, setMetadata] = useState<InstanceMetadata | null>(null)
  const [status, setStatus] = useState<InstanceStatus>('stopped')
  const applyStatus = useInstancesStore((s) => s.applyStatus)

  useEffect(() => {
    let cancelled = false
    window.chunkforge.servers.getMetadata(instanceId).then((data) => {
      if (!cancelled) {
        setMetadata(data)
        setStatus(data.status)
      }
    })
    return () => {
      cancelled = true
    }
  }, [instanceId])

  useEffect(() => {
    return window.chunkforge.servers.onStatusChanged((event) => {
      if (event.instanceId !== instanceId) return
      setStatus(event.status)
      applyStatus(event.instanceId, event.status)
    })
  }, [instanceId, applyStatus])

  if (!metadata) {
    return (
      <div className={styles.root}>
        <div className={styles.loading}>
          <Spinner label="Loading server…" />
        </div>
      </div>
    )
  }

  const isRunning = status === 'running'
  const isBusy = status === 'starting' || status === 'stopping'

  return (
    <div className={styles.root}>
      <div className={styles.topRow}>
        <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={onBack}>
          Servers
        </Button>
      </div>

      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <Title2>{metadata.name}</Title2>
          <div className={styles.meta}>
            <Text size={200}>
              {metadata.serverType} {metadata.minecraftVersion} · port {metadata.port}
            </Text>
            <StatusDot status={status} />
          </div>
        </div>

        <Button
          appearance="primary"
          disabled={isBusy}
          icon={isRunning ? <Stop24Filled /> : <Play24Filled />}
          onClick={() =>
            isRunning
              ? window.chunkforge.servers.stop(instanceId)
              : window.chunkforge.servers.start(instanceId)
          }
        >
          {isRunning ? 'Stop Server' : 'Start Server'}
        </Button>
      </div>

      <ConsoleView instanceId={instanceId} canSendCommands={isRunning} />
    </div>
  )
}
