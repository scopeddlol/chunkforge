import { useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Title3,
  Button,
  ProgressBar,
  MessageBar,
  MessageBarBody
} from '@fluentui/react-components'
import { Rocket24Regular } from '@fluentui/react-icons'
import type { CreateProgressEvent, InstanceMetadata } from '@shared/types'
import { toCreateInstanceConfig, type WizardState } from '../wizardState'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    maxWidth: '460px'
  },
  summary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between'
  },
  label: {
    color: tokens.colorNeutralForeground3
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  }
})

interface ReviewStepProps {
  state: WizardState
  onCreated: (metadata: InstanceMetadata) => void
}

export function ReviewStep({ state, onCreated }: ReviewStepProps): JSX.Element {
  const styles = useStyles()
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState<CreateProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!creating) return undefined
    return window.chunkforge.servers.onCreateProgress((event) => setProgress(event))
  }, [creating])

  async function handleCreate(): Promise<void> {
    setCreating(true)
    setError(null)
    try {
      const metadata = await window.chunkforge.servers.create(toCreateInstanceConfig(state))
      onCreated(metadata)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create server.')
      setCreating(false)
    }
  }

  const enabledToggleLabels = Object.entries({
    'Online mode': state.toggles.onlineMode,
    PvP: state.toggles.pvp,
    Hardcore: state.toggles.hardcore,
    Whitelist: state.toggles.whitelist,
    'Command blocks': state.toggles.commandBlocksEnabled
  })
    .filter(([, on]) => on)
    .map(([label]) => label)

  return (
    <div className={styles.root}>
      <Title3>Review &amp; create</Title3>

      <div className={styles.summary}>
        <div className={styles.row}>
          <Text className={styles.label}>Type</Text>
          <Text weight="semibold">{state.serverType}</Text>
        </div>
        <div className={styles.row}>
          <Text className={styles.label}>Version</Text>
          <Text weight="semibold">{state.minecraftVersion || '—'}</Text>
        </div>
        <div className={styles.row}>
          <Text className={styles.label}>Name</Text>
          <Text weight="semibold">{state.name || 'Untitled Server'}</Text>
        </div>
        <div className={styles.row}>
          <Text className={styles.label}>RAM</Text>
          <Text weight="semibold">
            {(state.minRamMb / 1024).toFixed(1)}–{(state.maxRamMb / 1024).toFixed(1)} GB
          </Text>
        </div>
        <div className={styles.row}>
          <Text className={styles.label}>Port</Text>
          <Text weight="semibold">{state.port}</Text>
        </div>
        <div className={styles.row}>
          <Text className={styles.label}>Difficulty</Text>
          <Text weight="semibold">{state.toggles.difficulty}</Text>
        </div>
        <div className={styles.row}>
          <Text className={styles.label}>Enabled</Text>
          <Text weight="semibold" style={{ textAlign: 'right' }}>
            {enabledToggleLabels.length > 0 ? enabledToggleLabels.join(', ') : 'None'}
          </Text>
        </div>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {creating ? (
        <div className={styles.progressBlock}>
          <ProgressBar value={progress?.percent != null ? progress.percent / 100 : undefined} />
          <Text>{progress?.message ?? 'Starting…'}</Text>
        </div>
      ) : (
        <Button appearance="primary" size="large" icon={<Rocket24Regular />} onClick={handleCreate}>
          Create Server
        </Button>
      )}
    </div>
  )
}
