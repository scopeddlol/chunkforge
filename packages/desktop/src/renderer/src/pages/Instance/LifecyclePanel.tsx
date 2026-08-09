import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  Button,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Switch,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { ServerLifecycle } from '@shared/types'
import { api } from '../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '14px' },
  row: { display: 'flex', gap: '14px', flexWrap: 'wrap' },
  narrow: { minWidth: '150px' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  actions: { display: 'flex', gap: '8px', alignItems: 'center' }
})

interface LifecyclePanelProps {
  instanceId: string
  /** Servers with a Portal address can be woken by anyone; local ones cannot. */
  hasPortalAddress: boolean
}

/**
 * When a server should run, and when it should look after itself.
 *
 * The rules interact, so the panel says how rather than leaving someone to
 * discover it: a scheduled stop beats everything, and sleep is suppressed
 * inside scheduled hours so the two never take turns undoing each other.
 */
export function LifecyclePanel({ instanceId, hasPortalAddress }: LifecyclePanelProps): JSX.Element {
  const styles = useStyles()
  const [draft, setDraft] = useState<ServerLifecycle>({})
  const [saved, setSaved] = useState<ServerLifecycle>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const lifecycle = await api().servers.lifecycle(instanceId)
      setDraft(lifecycle)
      setSaved(lifecycle)
    } catch {
      // A server that has never had rules simply has none.
      setDraft({})
      setSaved({})
    }
  }, [instanceId])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  function patch(next: Partial<ServerLifecycle>): void {
    setDraft((prev) => ({ ...prev, ...next }))
    setError(null)
  }

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const stored = await api().servers.setLifecycle(instanceId, draft)
      setDraft(stored)
      setSaved(stored)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save those rules.')
    } finally {
      setBusy(false)
    }
  }

  const scheduled = Boolean(draft.startAt && draft.stopAt)

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.row}>
        <Field label="Start at" hint="Local time, daily. Leave blank for none." className={styles.narrow}>
          <Input
            type="time"
            value={draft.startAt ?? ''}
            onChange={(_, d) => patch({ startAt: d.value || undefined })}
          />
        </Field>
        <Field label="Stop at" hint="Local time, daily." className={styles.narrow}>
          <Input
            type="time"
            value={draft.stopAt ?? ''}
            onChange={(_, d) => patch({ stopAt: d.value || undefined })}
          />
        </Field>
      </div>

      <div className={styles.row}>
        <Field
          label="Restart every (hours)"
          hint="0 for never. Measured from when the server actually started."
          className={styles.narrow}
        >
          <Input
            type="number"
            min={0}
            value={String(draft.restartEveryHours ?? 0)}
            onChange={(_, d) => patch({ restartEveryHours: Number(d.value) || 0 })}
          />
        </Field>
        <Field
          label="Sleep after empty (minutes)"
          hint="0 for never."
          className={styles.narrow}
        >
          <Input
            type="number"
            min={0}
            value={String(draft.sleepAfterEmptyMinutes ?? 0)}
            onChange={(_, d) => patch({ sleepAfterEmptyMinutes: Number(d.value) || 0 })}
          />
        </Field>
      </div>

      {Boolean(draft.sleepAfterEmptyMinutes) && !hasPortalAddress && (
        <Text className={styles.muted}>
          A sleeping server has to be started again from here — nothing wakes it when someone tries to
          connect. Give it a Portal address if you want it reachable by name while it is off.
        </Text>
      )}

      {Boolean(draft.sleepAfterEmptyMinutes) && scheduled && (
        <Text className={styles.muted}>
          Sleep is ignored between {draft.startAt} and {draft.stopAt} — inside its scheduled hours a
          server is meant to stay up, even when empty.
        </Text>
      )}

      <Switch
        label="Take the server down for its scheduled backups"
        checked={Boolean(draft.maintenanceBackups)}
        disabled={!draft.restartEveryHours}
        onChange={(_, d) => patch({ maintenanceBackups: Boolean(d.checked) })}
      />
      <Text className={styles.muted}>
        {draft.restartEveryHours
          ? 'Runs on the restart interval: stop, back up, start again. A backup taken while the server is live can catch a chunk mid-write; this cannot.'
          : 'Needs a restart interval — this replaces that restart with a stop, a backup, and a start.'}
      </Text>

      <div className={styles.actions}>
        <Button appearance="primary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save Schedule'}
        </Button>
        {dirty && <Text className={styles.muted}>Unsaved changes.</Text>}
      </div>
    </div>
  )
}
