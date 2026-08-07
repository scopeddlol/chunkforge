import { useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Field,
  Input,
  Button,
  Badge,
  Dropdown,
  Option,
  Switch,
  MessageBar,
  MessageBarBody,
  Divider
} from '@fluentui/react-components'
import { CloudArrowUp20Regular, PlugDisconnected20Regular } from '@fluentui/react-icons'
import { defaultAppSettings, type AppSettings, type FileHubStatus } from '@shared/types'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  title: { color: tokens.colorNeutralForeground2 },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
  muted: { color: tokens.colorNeutralForeground3 },
  actions: { display: 'flex', gap: '8px' }
})

interface FileHubPanelProps {
  settings: AppSettings
  onPatch: (patch: Partial<AppSettings>) => Promise<void>
}

export function FileHubPanel({ settings, onPatch }: FileHubPanelProps): JSX.Element {
  const styles = useStyles()
  // Tolerate settings written by a build that predates this group rather than
  // taking the whole Settings page down with it.
  const fileHub = settings.fileHub ?? defaultAppSettings.fileHub
  const [status, setStatus] = useState<FileHubStatus | null>(null)
  const [baseUrl, setBaseUrl] = useState(fileHub.baseUrl)
  const [username, setUsername] = useState(fileHub.username)
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [needsTotp, setNeedsTotp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([])

  const refreshStatus = async (): Promise<void> => {
    const next = await window.chunkforge.filehub.status()
    setStatus(next)
    if (next.connected) {
      window.chunkforge.filehub
        .listFolders()
        .then(setFolders)
        .catch(() => setFolders([]))
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  async function signIn(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.chunkforge.filehub.login(
        baseUrl,
        username,
        password,
        totp || undefined
      )
      if (!result.ok) {
        setNeedsTotp(result.totpRequired)
        setMessage(result.message)
        return
      }
      setPassword('')
      setTotp('')
      setNeedsTotp(false)
      await refreshStatus()
    } finally {
      setBusy(false)
    }
  }

  async function signOut(): Promise<void> {
    await window.chunkforge.filehub.logout()
    setFolders([])
    await refreshStatus()
  }

  const connected = status?.connected === true
  const selectedFolder = folders.find((f) => f.id === fileHub.folderId)

  return (
    <div className={styles.panel}>
      <div className={styles.headerRow}>
        <Text weight="semibold" className={styles.title}>
          FileHub backups
        </Text>
        {connected ? (
          <Badge appearance="tint" color="success">
            Connected as {status?.username}
          </Badge>
        ) : (
          <Badge appearance="tint" color="informative">
            Not connected
          </Badge>
        )}
      </div>

      <Text size={200} className={styles.muted}>
        Send world backups straight to your own FileHub server. Only the session token is stored —
        your password is never saved.
      </Text>

      {message && (
        <MessageBar intent="warning">
          <MessageBarBody>{message}</MessageBarBody>
        </MessageBar>
      )}
      {status?.configured && !connected && status.message && (
        <MessageBar intent="warning">
          <MessageBarBody>{status.message}</MessageBarBody>
        </MessageBar>
      )}

      {!connected && (
        <>
          <Field label="Server URL" hint="e.g. https://files.example.com">
            <Input
              value={baseUrl}
              placeholder="https://files.example.com"
              onChange={(_, d) => setBaseUrl(d.value)}
            />
          </Field>
          <Field label="Username">
            <Input value={username} onChange={(_, d) => setUsername(d.value)} />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(_, d) => setPassword(d.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && baseUrl && username && password) signIn()
              }}
            />
          </Field>
          {needsTotp && (
            <Field label="Two-factor code">
              <Input value={totp} onChange={(_, d) => setTotp(d.value)} />
            </Field>
          )}
          <div className={styles.actions}>
            <Button
              appearance="primary"
              icon={<CloudArrowUp20Regular />}
              disabled={busy || !baseUrl || !username || !password}
              onClick={signIn}
            >
              {busy ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </>
      )}

      {connected && (
        <>
          <Field label="Destination folder">
            <Dropdown
              value={selectedFolder?.name ?? 'Root folder'}
              selectedOptions={fileHub.folderId ? [fileHub.folderId] : ['__root']}
              onOptionSelect={(_, d) =>
                onPatch({
                  fileHub: {
                    ...fileHub,
                    folderId: d.optionValue === '__root' ? null : (d.optionValue ?? null)
                  }
                })
              }
            >
              <Option value="__root">Root folder</Option>
              {folders.map((folder) => (
                <Option key={folder.id} value={folder.id}>
                  {folder.name}
                </Option>
              ))}
            </Dropdown>
          </Field>

          <Switch
            label="Upload new backups automatically"
            checked={fileHub.uploadBackupsAutomatically}
            onChange={(_, d) =>
              onPatch({
                fileHub: { ...fileHub, uploadBackupsAutomatically: d.checked }
              })
            }
          />

          <Divider />
          <div className={styles.actions}>
            <Button icon={<PlugDisconnected20Regular />} onClick={signOut}>
              Disconnect
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
