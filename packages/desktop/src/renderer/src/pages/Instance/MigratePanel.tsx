import { useEffect, useState, type JSX } from 'react'
import {
  Button,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  ProgressBar,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { InstanceMetadata, Node } from '@shared/types'
import { api, onEvent } from '../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: { display: 'flex', gap: '8px', alignItems: 'flex-end' },
  grow: { flexGrow: 1 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' }
})

interface MigratePanelProps {
  metadata: InstanceMetadata
  onMoved: (metadata: InstanceMetadata) => void
}

/**
 * Moves a server to a different node, keeping its address.
 *
 * Deliberately blunt about the cost: the server goes down for the transfer,
 * and how long that takes is a function of world size, not of anything this
 * panel can promise. Saying so beforehand is better than a progress bar that
 * silently sits at 40% for ten minutes.
 */
export function MigratePanel({ metadata, onMoved }: MigratePanelProps): JSX.Element {
  const styles = useStyles()
  const [nodes, setNodes] = useState<Node[]>([])
  const [target, setTarget] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ message: string; percent: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api()
      .nodes.list()
      // Only somewhere this server could actually run, and never where it is.
      .then((all) =>
        setNodes(all.filter((node) => node.kind === 'portal' && node.claimed && node.id !== metadata.nodeId))
      )
      .catch(() => setNodes([]))
  }, [metadata.nodeId])

  useEffect(
    () =>
      onEvent('migration-progress', (payload) => {
        if (payload.instanceId !== metadata.id) return
        setProgress({ message: payload.message, percent: payload.percent })
        if (payload.stage === 'done') setBusy(false)
      }),
    [metadata.id]
  )

  async function move(): Promise<void> {
    if (!target) return
    setBusy(true)
    setError(null)
    setProgress({ message: 'Starting…', percent: 0 })
    try {
      const moved = await api().servers.migrate(metadata.id, target)
      onMoved(moved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The move did not finish.')
    } finally {
      setBusy(false)
    }
  }

  if (nodes.length === 0) {
    return (
      <Text className={styles.muted}>
        There is nowhere else to move this server. Adopt another node on the Nodes page first.
      </Text>
    )
  }

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.row}>
        <Field label="Destination node" className={styles.grow}>
          <Dropdown
            placeholder="Choose a node…"
            value={nodes.find((n) => n.id === target)?.name ?? ''}
            selectedOptions={target ? [target] : []}
            disabled={busy}
            onOptionSelect={(_, data) => setTarget(data.optionValue ?? null)}
          >
            {nodes.map((node) => (
              <Option key={node.id} value={node.id} text={node.name}>
                {node.name}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Button appearance="primary" disabled={!target || busy} onClick={() => void move()}>
          {busy ? 'Moving…' : 'Move Server'}
        </Button>
      </div>

      {progress && (
        <>
          <ProgressBar value={progress.percent === null ? undefined : progress.percent / 100} />
          <Text className={styles.muted}>{progress.message}</Text>
        </>
      )}

      <Text className={styles.muted}>
        The server stops for the move and starts again on the new node.
        {metadata.portalHostname
          ? ` Its address, ${metadata.portalHostname}, stays exactly the same — players do not need to change anything.`
          : ' It has no Portal address, so whatever players connect to now will change.'}{' '}
        How long it takes depends on the size of the world.
      </Text>
    </div>
  )
}
