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
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    if (!creating) return undefined
    return window.chunkforge.servers.onCreateProgress((event) => setProgress(event))
  }, [creating])

  async function handleCreate(): Promise<void> {
    setCreating(true)
    setError(null)
    try {
      const metadata = await window.chunkforge.servers.create(toCreateInstanceConfig(state))

      // A modpack replaces the whole mod set, so it goes on before anything
      // queued individually.
      if (state.modpack) {
        setProgress({
          instanceId: metadata.id,
          stage: 'done',
          message: `Installing ${state.modpack.name}…`,
          percent: 0
        })
        try {
          await window.chunkforge.modpacks.install(
            metadata.id,
            state.modpack.source,
            state.modpack.downloadUrl
          )
        } catch (err) {
          setWarning(
            `Server created, but the modpack didn't install: ${(err as Error).message}. You can retry from the Modpacks page.`
          )
        }
      }

      // Queued plugins install after the server exists, so a single failure
      // leaves a usable server rather than aborting creation.
      const failed: string[] = []
      for (const [index, queued] of state.initialPlugins.entries()) {
        setProgress({
          instanceId: metadata.id,
          stage: 'done',
          message: `Installing ${queued.name} (${index + 1}/${state.initialPlugins.length})…`,
          percent: Math.round((index / state.initialPlugins.length) * 100)
        })
        try {
          const versions = await window.chunkforge.plugins.listVersions(queued.source, queued.projectId)
          const installable = versions.find((v) => v.downloadUrl)
          if (!installable) throw new Error('no downloadable version')
          await window.chunkforge.plugins.install(metadata.id, installable, queued.name)
        } catch {
          failed.push(queued.name)
        }
      }

      if (failed.length > 0) {
        setWarning(`Server created, but these couldn't be installed automatically: ${failed.join(', ')}`)
      }
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
          <Text className={styles.label}>Location</Text>
          <Text weight="semibold">{state.installLocation ?? 'Default'}</Text>
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
        {state.modpack && (
          <div className={styles.row}>
            <Text className={styles.label}>Modpack</Text>
            <Text weight="semibold" style={{ textAlign: 'right' }}>
              {state.modpack.name}
            </Text>
          </div>
        )}
        {state.enableGeyser && (
          <div className={styles.row}>
            <Text className={styles.label}>Crossplay</Text>
            <Text weight="semibold">Geyser + Floodgate</Text>
          </div>
        )}
        {state.initialPlugins.length > 0 && (
          <div className={styles.row}>
            <Text className={styles.label}>Plugins</Text>
            <Text weight="semibold" style={{ textAlign: 'right' }}>
              {state.initialPlugins.map((p) => p.name).join(', ')}
            </Text>
          </div>
        )}
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
      {warning && (
        <MessageBar intent="warning">
          <MessageBarBody>{warning}</MessageBarBody>
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
