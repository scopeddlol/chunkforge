import { useEffect, type JSX } from 'react'
import { makeStyles, tokens, Text, Title2, Button } from '@fluentui/react-components'
import { AddCircle24Regular } from '@fluentui/react-icons'
import { ChunkforgeMark } from '../../components/ChunkforgeMark'
import { useInstancesStore } from '../../state/instancesStore'
import { InstanceCard } from './InstanceCard'

const useStyles = makeStyles({
  root: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '28px 36px',
    overflow: 'auto'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px'
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    marginTop: '4px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '14px'
  },
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
  emptyBody: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '360px',
    lineHeight: '20px'
  }
})

interface DashboardPageProps {
  onOpenWizard: () => void
  onOpenInstance: (id: string) => void
}

export function DashboardPage({ onOpenWizard, onOpenInstance }: DashboardPageProps): JSX.Element {
  const styles = useStyles()
  const { instances, loaded, refresh, applyStatus } = useInstancesStore()

  useEffect(() => {
    refresh()
  }, [refresh])

  // Cards stay live while the user sits on the dashboard.
  useEffect(() => {
    return window.chunkforge.servers.onStatusChanged((event) =>
      applyStatus(event.instanceId, event.status)
    )
  }, [applyStatus])

  function handleStart(id: string): void {
    window.chunkforge.servers.start(id)
  }

  function handleStop(id: string): void {
    window.chunkforge.servers.stop(id)
  }

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
          <Button appearance="primary" icon={<AddCircle24Regular />} onClick={onOpenWizard}>
            New Server
          </Button>
        )}
      </div>

      {!loaded && null}

      {loaded && hasInstances && (
        <div className={styles.grid}>
          {instances.map((instance) => (
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

      {loaded && !hasInstances && (
        <div className={styles.emptyState}>
          <div className={styles.markBadge}>
            <ChunkforgeMark size={40} />
          </div>
          <Title2>No servers yet</Title2>
          <Text className={styles.emptyBody}>
            Spin up a Vanilla, Paper, Purpur, Spigot, Forge, or Fabric server in a few clicks — pick
            a version, tune your settings, and add plugins before the first boot.
          </Text>
          <Button appearance="primary" icon={<AddCircle24Regular />} size="large" onClick={onOpenWizard}>
            Create Your First Server
          </Button>
        </div>
      )}
    </div>
  )
}
