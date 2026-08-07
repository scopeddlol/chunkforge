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
  DialogActions
} from '@fluentui/react-components'
import {
  ArrowSync20Regular,
  Delete20Regular,
  ArrowDownload20Regular,
  DatabaseArrowUp20Regular,
  CloudArrowUp20Regular
} from '@fluentui/react-icons'
import type { BackupEntry } from '@shared/types'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, minHeight: 0 },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
  hint: { color: tokens.colorNeutralForeground3 },
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

export function BackupsTab({ instanceId, serverRunning }: BackupsTabProps): JSX.Element {
  const styles = useStyles()
  const [backups, setBackups] = useState<BackupEntry[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null)
  const [fileHubReady, setFileHubReady] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadPercent, setUploadPercent] = useState(0)

  const load = useCallback(() => {
    window.chunkforge.backups
      .list(instanceId)
      .then(setBackups)
      .catch((err: Error) => setError(err.message))
  }, [instanceId])

  useEffect(load, [load])

  useEffect(() => {
    window.chunkforge.filehub.status().then((status) => setFileHubReady(status.connected))
  }, [])

  useEffect(() => {
    return window.chunkforge.filehub.onUploadProgress((event) => {
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
      await window.chunkforge.filehub.uploadBackup(instanceId, backup.filename)
    } catch (err) {
      setError((err as Error).message)
      setUploading(null)
    }
  }

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const created = await window.chunkforge.backups.create(instanceId)
      load()
      const settings = await window.chunkforge.settings.get()
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
      await window.chunkforge.backups.restore(instanceId, backup.filename)
      setRestoreTarget(null)
      load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(backup: BackupEntry): Promise<void> {
    await window.chunkforge.backups.delete(instanceId, backup.filename)
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

      <div className={styles.toolbar}>
        <Text size={200} className={styles.hint}>
          {serverRunning
            ? 'Stop the server first for a clean, consistent backup.'
            : `${backups.length} backup${backups.length === 1 ? '' : 's'} saved.`}
        </Text>
        <Button appearance="primary" icon={<ArrowDownload20Regular />} disabled={busy} onClick={create}>
          {busy ? 'Working…' : 'Back Up World'}
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
