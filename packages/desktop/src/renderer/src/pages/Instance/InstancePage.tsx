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
  Badge,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@fluentui/react-components'
import {
  ArrowLeft20Regular,
  Play20Filled,
  Stop20Filled,
  ArrowSync20Regular,
  MoreHorizontal20Regular,
  Prohibited20Regular,
  FolderOpen20Regular,
  Window20Regular,
  Chat20Regular,
  People20Regular,
  AppsAddIn20Regular,
  Folder20Regular,
  DatabaseArrowUp20Regular,
  Settings20Regular
} from '@fluentui/react-icons'
import type { InstanceMetadata, InstanceStatus } from '@shared/types'
import { StatusDot } from '../../components/StatusDot'
import { CopyableAddress } from '../../components/CopyableAddress'
import { resolveServerAddress } from '../../components/serverAddress'
import { ConsoleView } from '../../components/ConsoleView'
import { useConfirmStop } from '../../components/ConfirmStopDialog'
import { useInstancesStore } from '../../state/instancesStore'
import { InstalledPluginsTab } from './InstalledPluginsTab'
import { InstanceSettingsTab } from './InstanceSettingsTab'
import { PlayersTab } from './PlayersTab'
import { ChatTab } from './ChatTab'
import { FilesTab } from './FilesTab'
import { BackupsTab } from './BackupsTab'
import { api, onEvent } from '../../api'
import { native } from '../../native'

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

type TabKey = 'console' | 'chat' | 'players' | 'plugins' | 'files' | 'backups' | 'settings'

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
  const [confirmKill, setConfirmKill] = useState(false)
  const [onlinePlayers, setOnlinePlayers] = useState<string[]>([])
  const applyStatus = useInstancesStore((s) => s.applyStatus)
  const refreshInstances = useInstancesStore((s) => s.refresh)
  const summary = useInstancesStore((s) => s.instances.find((i) => i.id === instanceId))
  const { requestStop, dialog: confirmStopDialog } = useConfirmStop()

  useEffect(() => {
    let cancelled = false
    api().servers.get(instanceId).then((data) => {
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
    return onEvent('status', (event) => {
      if (event.instanceId !== instanceId) return
      setStatus(event.status)
      applyStatus(event.instanceId, event.status)
    })
  }, [instanceId, applyStatus])

  useEffect(() => {
    api()
      .servers.get(instanceId)
      .then((data) => setOnlinePlayers(data.onlinePlayers ?? []))
    return onEvent('players', (event) => {
      if (event.instanceId === instanceId) setOnlinePlayers(event.players)
    })
  }, [instanceId])

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
            {(() => {
              // The list summary is enriched with Portal's own domain records,
              // so it knows the public address even for a server whose node
              // never persisted one. Fall back to this server's own metadata
              // when the list has not loaded yet.
              const address = resolveServerAddress({ ...metadata, ...(summary ?? {}) })
              if (address.kind === 'none') return <Text size={200}>No public address yet</Text>
              return <CopyableAddress address={address.value} />
            })()}
            <Text size={200}>{(metadata.maxRamMb / 1024).toFixed(1)} GB max</Text>
            {isRunning && (
              <Text size={200}>
                {onlinePlayers.length}/{metadata.maxPlayers} online
              </Text>
            )}
            <StatusDot status={status} />
          </div>
        </div>

        <div className={styles.headerActions}>
          <Button
            appearance="subtle"
            icon={<FolderOpen20Regular />}
            title="Open server folder"
            onClick={() => native().openFolder(metadata.id)}
          />
          <Button
            appearance="secondary"
            disabled={isBusy}
            icon={<ArrowSync20Regular />}
            title="Stop and start again"
            onClick={() => void api().servers.restart(instanceId)}
          >
            Restart
          </Button>
          <Button
            appearance="primary"
            disabled={isBusy}
            icon={isRunning ? <Stop20Filled /> : <Play20Filled />}
            onClick={() =>
              isRunning
                ? requestStop(instanceId, metadata.name)
                : api().servers.start(instanceId)
            }
          >
            {isRunning ? 'Stop Server' : isBusy ? 'Working…' : 'Start Server'}
          </Button>
          {/* Killing is destructive and sits behind a menu rather than beside
              "Stop", so it is never the button someone hits by muscle memory. */}
          {isRunning && (
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button appearance="subtle" icon={<MoreHorizontal20Regular />} title="More actions" />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<Prohibited20Regular />} onClick={() => setConfirmKill(true)}>
                    Kill process…
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          )}
        </div>
      </div>

      <Dialog open={confirmKill} onOpenChange={(_, d) => !d.open && setConfirmKill(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Kill “{metadata.name}”?</DialogTitle>
            <DialogContent>
              <Text>
                This ends the process immediately without asking Minecraft to save. Anything since
                the last autosave is lost, and the world can be left needing a repair on next start.
              </Text>
              <Text block style={{ marginTop: '10px' }}>
                Use <b>Stop Server</b> unless the server has stopped responding.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmKill(false)}>Cancel</Button>
              <Button
                appearance="primary"
                onClick={() => {
                  setConfirmKill(false)
                  void api().servers.kill(instanceId)
                }}
              >
                Kill process
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <TabList
        className={styles.tabs}
        selectedValue={tab}
        onTabSelect={(_, data) => setTab(data.value as TabKey)}
      >
        <Tab value="console" icon={<Window20Regular />}>
          Console
        </Tab>
        <Tab value="chat" icon={<Chat20Regular />}>
          Chat
        </Tab>
        <Tab value="players" icon={<People20Regular />}>
          {onlinePlayers.length > 0 ? `Players (${onlinePlayers.length})` : 'Players'}
        </Tab>
        <Tab value="plugins" icon={<AppsAddIn20Regular />}>
          Add-Ons
        </Tab>
        <Tab value="files" icon={<Folder20Regular />}>
          Files
        </Tab>
        <Tab value="backups" icon={<DatabaseArrowUp20Regular />}>
          Backups
        </Tab>
        <Tab value="settings" icon={<Settings20Regular />}>
          Settings
        </Tab>
      </TabList>

      <div className={styles.tabPanel}>
        {tab === 'console' && <ConsoleView instanceId={instanceId} canSendCommands={isRunning} />}
        {tab === 'chat' && <ChatTab instanceId={instanceId} serverRunning={isRunning} />}
        {tab === 'players' && <PlayersTab instanceId={instanceId} serverRunning={isRunning} />}
        {tab === 'plugins' && (
          <InstalledPluginsTab
            instanceId={instanceId}
            serverType={metadata.serverType}
            serverRunning={isRunning}
            onBrowse={() => onBrowsePlugins(instanceId)}
          />
        )}
        {tab === 'files' && <FilesTab instanceId={instanceId} />}
        {tab === 'backups' && <BackupsTab instanceId={instanceId} serverRunning={isRunning} />}
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

      {confirmStopDialog}
    </div>
  )
}
