import { useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Title2,
  Button,
  Spinner,
  TabList,
  Tab,
  Badge
} from '@fluentui/react-components'
import {
  ArrowLeft20Regular,
  Play20Filled,
  Stop20Filled,
  FolderOpen20Regular
} from '@fluentui/react-icons'
import type { InstanceMetadata, InstanceStatus } from '@shared/types'
import { StatusDot } from '../../components/StatusDot'
import { ConsoleView } from '../../components/ConsoleView'
import { useInstancesStore } from '../../state/instancesStore'
import { InstalledPluginsTab } from './InstalledPluginsTab'
import { InstanceSettingsTab } from './InstanceSettingsTab'

const useStyles = makeStyles({
  root: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    padding: '18px 36px 24px'
  },
  backRow: { marginBottom: '8px' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '14px'
  },
  titleBlock: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  accentBar: { width: '4px', height: '26px', borderRadius: '2px', flexShrink: 0 },
  meta: { display: 'flex', alignItems: 'center', gap: '12px', color: tokens.colorNeutralForeground3 },
  headerActions: { display: 'flex', gap: '8px', flexShrink: 0 },
  tabs: { marginBottom: '14px' },
  tabPanel: { flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  loading: { flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }
})

type TabKey = 'console' | 'plugins' | 'settings'

interface InstancePageProps {
  instanceId: string
  onBack: () => void
  onBrowsePlugins: (instanceId: string) => void
}

export function InstancePage({ instanceId, onBack, onBrowsePlugins }: InstancePageProps): JSX.Element {
  const styles = useStyles()
  const [metadata, setMetadata] = useState<InstanceMetadata | null>(null)
  const [status, setStatus] = useState<InstanceStatus>('stopped')
  const [tab, setTab] = useState<TabKey>('console')
  const applyStatus = useInstancesStore((s) => s.applyStatus)
  const refreshInstances = useInstancesStore((s) => s.refresh)

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
      <div className={styles.backRow}>
        <Button appearance="subtle" icon={<ArrowLeft20Regular />} onClick={onBack}>
          Servers
        </Button>
      </div>

      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <span className={styles.accentBar} style={{ backgroundColor: metadata.accentColor }} />
            <Title2>{metadata.name}</Title2>
          </div>
          <div className={styles.meta}>
            <Badge appearance="tint" color="informative">
              {metadata.serverType} {metadata.minecraftVersion}
            </Badge>
            <Text size={200}>port {metadata.port}</Text>
            <Text size={200}>{(metadata.maxRamMb / 1024).toFixed(1)} GB max</Text>
            <StatusDot status={status} />
          </div>
        </div>

        <div className={styles.headerActions}>
          <Button
            appearance="subtle"
            icon={<FolderOpen20Regular />}
            title="Open server folder"
            onClick={() => window.chunkforge.servers.openFolder(metadata.id)}
          />
          <Button
            appearance="primary"
            disabled={isBusy}
            icon={isRunning ? <Stop20Filled /> : <Play20Filled />}
            onClick={() =>
              isRunning
                ? window.chunkforge.servers.stop(instanceId)
                : window.chunkforge.servers.start(instanceId)
            }
          >
            {isRunning ? 'Stop Server' : isBusy ? 'Working…' : 'Start Server'}
          </Button>
        </div>
      </div>

      <TabList
        className={styles.tabs}
        selectedValue={tab}
        onTabSelect={(_, data) => setTab(data.value as TabKey)}
      >
        <Tab value="console">Console</Tab>
        <Tab value="plugins">Plugins</Tab>
        <Tab value="settings">Settings</Tab>
      </TabList>

      <div className={styles.tabPanel}>
        {tab === 'console' && <ConsoleView instanceId={instanceId} canSendCommands={isRunning} />}
        {tab === 'plugins' && (
          <InstalledPluginsTab
            instanceId={instanceId}
            serverRunning={isRunning}
            onBrowse={() => onBrowsePlugins(instanceId)}
          />
        )}
        {tab === 'settings' && (
          <InstanceSettingsTab
            metadata={metadata}
            onSaved={(updated) => {
              setMetadata(updated)
              refreshInstances()
            }}
            onDeleted={() => {
              refreshInstances()
              onBack()
            }}
          />
        )}
      </div>
    </div>
  )
}
