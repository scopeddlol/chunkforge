import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Switch,
  Spinner,
  MessageBar,
  MessageBarBody
} from '@fluentui/react-components'
import { Delete20Regular, AddCircle24Regular, AppsAddIn24Regular } from '@fluentui/react-icons'
import { serverTypeCategory, type InstalledPlugin, type ServerType } from '@shared/types'
import { api } from '../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, minHeight: 0 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  hint: { color: tokens.colorNeutralForeground3 },
  list: { display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flexGrow: 1, minHeight: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  name: { flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  disabledName: { color: tokens.colorNeutralForeground3 },
  size: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    padding: '56px 0',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center'
  }
})

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

interface InstalledPluginsTabProps {
  instanceId: string
  serverType: ServerType
  serverRunning: boolean
  onBrowse: () => void
}

export function InstalledPluginsTab({
  instanceId,
  serverType,
  serverRunning,
  onBrowse
}: InstalledPluginsTabProps): JSX.Element {
  // Wording follows the server type: mod loaders install mods, not plugins.
  const noun = serverTypeCategory[serverType] === 'mods' ? 'mod' : 'plugin'
  const styles = useStyles()
  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api()
      .addons.installed(instanceId)
      .then(setPlugins)
      .catch((err: Error) => setError(err.message))
  }, [instanceId])

  useEffect(load, [load])

  async function toggle(plugin: InstalledPlugin): Promise<void> {
    await api().addons.setEnabled(instanceId, plugin.filename, !plugin.enabled)
    load()
  }

  async function remove(plugin: InstalledPlugin): Promise<void> {
    await api().addons.uninstall(instanceId, plugin.filename)
    load()
  }

  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    )
  }

  if (!plugins) return <Spinner size="tiny" label={`Reading ${noun}s folder…`} />

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Text className={styles.hint} size={200}>
          {serverRunning
            ? 'Server is running — changes apply after a restart.'
            : `${plugins.length} ${noun}${plugins.length === 1 ? '' : 's'} installed.`}
        </Text>
        <Button appearance="primary" size="small" icon={<AddCircle24Regular />} onClick={onBrowse}>
          {`Browse ${noun === 'mod' ? 'Mods' : 'Plugins'}`}
        </Button>
      </div>

      {plugins.length === 0 ? (
        <div className={styles.empty}>
          <AppsAddIn24Regular fontSize={32} />
          <Text>{`No ${noun}s installed yet.`}</Text>
          <Button appearance="primary" icon={<AddCircle24Regular />} onClick={onBrowse}>
            {`Browse ${noun === 'mod' ? 'Mods' : 'Plugins'}`}
          </Button>
        </div>
      ) : (
        <div className={styles.list}>
          {plugins.map((plugin) => (
            <div className={styles.row} key={plugin.filename}>
              <Switch checked={plugin.enabled} onChange={() => toggle(plugin)} />
              <Text className={`${styles.name} ${plugin.enabled ? '' : styles.disabledName}`}>
                {plugin.filename.replace(/\.disabled$/, '')}
              </Text>
              <Text size={200} className={styles.size}>
                {formatSize(plugin.sizeBytes)}
              </Text>
              <Button
                appearance="subtle"
                size="small"
                icon={<Delete20Regular />}
                title="Uninstall"
                onClick={() => remove(plugin)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
