import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  Checkbox,
  SpinButton,
  Field
} from '@fluentui/react-components'
import {
  ArrowSync20Regular,
  Delete20Regular,
  ArrowDownload20Regular,
  DatabaseArrowUp20Regular,
  CloudArrowUp20Regular
} from '@fluentui/react-icons'
import {
  defaultBackupContents,
  type BackupContents,
  type BackupEntry,
  type BackupSchedule
} from '@shared/types'
import { api, onEvent } from '../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, minHeight: 0 },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  hint: { color: tokens.colorNeutralForeground3 },
  schedulePanel: { display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px 16px', borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  scheduleHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
  scheduleFields: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  contentsRow: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  scheduleField: { minWidth: '130px' },
  list: { display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flexGrow: 1, minHeight: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  info: { display: 'flex', flexDirection: 'column', gap: '2px', flexGrow: 1, minWidth: 0 },
  filename: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { color: tokens.colorNeutralForeground3 },
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
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

interface BackupsTabProps {
  instanceId: string
  serverRunning: boolean
}

/** The three things a backup can hold, in the order they matter. */
const CONTENT_CHOICES: Array<{ key: keyof BackupContents; label: string; hint: string }> = [
  { key: 'worlds', label: 'Worlds', hint: 'world, nether and end — the part nobody can regenerate' },
  { key: 'addons', label: 'Plugins & mods', hint: 'plugins/ and mods/, including their own config folders' },
  { key: 'configs', label: 'Configs', hint: 'server.properties, loader configs, ops and whitelist' }
]

/** Says what pressing the button will actually capture. */
function backupButtonLabel(schedule: BackupSchedule | null): string {
  if (!schedule) return 'Back Up'
  const contents = contentsOf(schedule)
  const parts: string[] = []
  if (contents.worlds) parts.push('World')
  if (contents.addons) parts.push('Add-Ons')
  if (contents.configs) parts.push('Configs')
  return `Back Up ${parts.join(' + ') || 'World'}`
}

/** Schedules written before this was configurable meant worlds only. */
function contentsOf(schedule: BackupSchedule): BackupContents {
  return schedule.contents ?? defaultBackupContents
}

export function BackupsTab({ instanceId, serverRunning }: BackupsTabProps): JSX.Element {
  const styles = useStyles()
  const [backups, setBackups] = useState<BackupEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)
  const [fileHubReady, setFileHubReady] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null)

  const load = useCallback(() => {
    api()
      .backups.list(instanceId)
      .then(setBackups)
      .catch((err: Error) => setError(err.message))
  }, [instanceId])

  useEffect(load, [load])

  useEffect(() => {
    api()
      .filehub.status()
      .then((status) => setFileHubReady(status.connected))
    api().backups.getSchedule(instanceId).then(setSchedule)
  }, [instanceId])

  // Scheduled runs happen server-side, so the list refreshes on notice.
  useEffect(() => {
    return onEvent('backup-created', (event) => {
      if (event.instanceId === instanceId) load()
    })
  }, [instanceId, load])

  async function saveSchedule(next: BackupSchedule): Promise<void> {
    setSchedule(next)
    await api().backups.setSchedule(instanceId, next)
  }

  useEffect(() => {
    return onEvent('filehub-upload', (event) => {
      if (event.instanceId !== instanceId) return
      setUploadPercent(event.percent)
      if (event.done) {
        setUploading(null)
        if (event.error) setError(`FileHub upload failed: ${event.error}`)
      }
    })
  }, [instanceId])

  async function upload(backup: BackupEntry): Promise<void> {
    setUploading(backup.filename)
    setUploadPercent(0)
    setError(null)
    try {
      await api().filehub.upload(instanceId, backup.filename)
    } catch (err) {
      setError((err as Error).message)
      setUploading(null)
    }
  }

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const created = await api().backups.create(instanceId)
      load()
      const settings = await api().settings.get()
      if (settings.fileHub.uploadBackupsAutomatically && fileHubReady) {
        upload(created)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function restore(backup: BackupEntry): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await api().backups.restore(instanceId, backup.filename)
      setRestoreTarget(null)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(backup: BackupEntry): Promise<void> {
    await api().backups.remove(instanceId, backup.filename)
    load()
  }

  if (!backups) return <Spinner size="tiny" label="Loading backups…" />

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {schedule && (
        <div className={styles.schedulePanel}>
          <div className={styles.scheduleHeader}>
            <Switch
              label="Automatic backups"
              checked={schedule.enabled}
              onChange={(_, d) => saveSchedule({ ...schedule, enabled: d.checked })}
            />
            {schedule.enabled && (
              <Text size={200} className={styles.hint}>
                Every {schedule.intervalHours}h · keeping {schedule.keepCount || 'all'}
              </Text>
            )}
          </div>

          {schedule.enabled && (
            <div className={styles.scheduleFields}>
              <Field label="Every (hours)" className={styles.scheduleField}>
                <SpinButton
                  size="small"
                  min={1}
                  max={168}
                  value={schedule.intervalHours}
                  onChange={(_, d) => {
                    const next = d.value ?? (Number(d.displayValue) || schedule.intervalHours)
                    saveSchedule({ ...schedule, intervalHours: next })
                  }}
                />
              </Field>
              <Field label="Keep last (0 = all)" className={styles.scheduleField}>
                <SpinButton
                  size="small"
                  min={0}
                  max={100}
                  value={schedule.keepCount}
                  onChange={(_, d) => {
                    const next = d.value ?? (Number(d.displayValue) || 0)
                    saveSchedule({ ...schedule, keepCount: next })
                  }}
                />
              </Field>
              <Switch
                label="Upload to FileHub"
                disabled={!fileHubReady}
                checked={schedule.uploadToFileHub}
                onChange={(_, d) => saveSchedule({ ...schedule, uploadToFileHub: d.checked })}
              />

            </div>
          )}

          {/* Outside the enabled block on purpose: this governs the manual
              backup button as well, so it has to be reachable for someone who
              never turns the schedule on. */}
          <Field label="What to include">
            <div className={styles.contentsRow}>
              {CONTENT_CHOICES.map(({ key, label, hint }) => (
                <Checkbox
                  key={key}
                  label={label}
                  title={hint}
                  checked={contentsOf(schedule)[key]}
                  onChange={(_, d) => {
                    const next = { ...contentsOf(schedule), [key]: Boolean(d.checked) }
                    // Every box cleared would back up nothing, and fail every
                    // time. Worlds is what to fall back to: the part nobody
                    // can regenerate.
                    if (!next.worlds && !next.addons && !next.configs) next.worlds = true
                    saveSchedule({ ...schedule, contents: next })
                  }}
                />
              ))}
            </div>
          </Field>
        </div>
      )}

      <div className={styles.toolbar}>
        <Text size={200} className={styles.hint}>
          {serverRunning
            ? 'Stop the server first for a clean, consistent backup.'
            : `${backups.length} backup${backups.length === 1 ? '' : 's'} saved.`}
        </Text>
        <Button appearance="primary" icon={<ArrowDownload20Regular />} disabled={busy} onClick={create}>
          {busy ? 'Working…' : backupButtonLabel(schedule)}
        </Button>
      </div>

      {backups.length === 0 ? (
        <div className={styles.empty}>
          <DatabaseArrowUp20Regular fontSize={32} />
          <Text>No backups yet. Snapshots archive the overworld, nether, and end.</Text>
          <Button appearance="primary" icon={<ArrowDownload20Regular />} disabled={busy} onClick={create}>
            Create First Backup
          </Button>
        </div>
      ) : (
        <div className={styles.list}>
          {backups.map((backup) => (
            <div className={styles.row} key={backup.filename}>
              <div className={styles.info}>
                <Text weight="semibold" className={styles.filename}>
                  {backup.filename}
                </Text>
                <Text size={200} className={styles.meta}>
                  {new Date(backup.createdAt).toLocaleString()} · {formatSize(backup.sizeBytes)}
                </Text>
              </div>
              <Button
                appearance="secondary"
                size="small"
                icon={<ArrowSync20Regular />}
                disabled={busy || serverRunning}
                title={serverRunning ? 'Stop the server before restoring' : 'Restore this backup'}
                onClick={() => setRestoreTarget(backup)}
              >
                Restore
              </Button>
              <Button
                appearance="subtle"
                size="small"
                icon={<CloudArrowUp20Regular />}
                title={
                  fileHubReady
                    ? 'Upload to FileHub'
                    : 'Connect a FileHub instance in Settings to upload backups'
                }
                disabled={busy || !fileHubReady || uploading === backup.filename}
                onClick={() => upload(backup)}
              >
                {uploading === backup.filename ? `${uploadPercent}%` : ''}
              </Button>
              <Button
                appearance="subtle"
                size="small"
                icon={<Delete20Regular />}
                title="Delete backup"
                disabled={busy}
                onClick={() => remove(backup)}
              />
            </div>
          ))}
        </div>
      )}

      <Dialog open={restoreTarget !== null} onOpenChange={(_, d) => !d.open && setRestoreTarget(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogContent>
              <Text>
                This replaces the current world with the snapshot from{' '}
                {restoreTarget ? new Date(restoreTarget.createdAt).toLocaleString() : ''}. The existing
                world is deleted and cannot be recovered unless you back it up first.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setRestoreTarget(null)}>Cancel</Button>
              <Button
                appearance="primary"
                disabled={busy}
                onClick={() => restoreTarget && restore(restoreTarget)}
              >
                {busy ? 'Restoring…' : 'Restore'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
