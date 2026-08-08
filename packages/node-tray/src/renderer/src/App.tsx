import { useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Divider,
  Field,
  Input,
  Spinner,
  Switch,
  Text,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { NodeConfigView, NodeStatusView } from './types'
import { BrandLockup } from './BrandLockup'

const useStyles = makeStyles({
  root: {
    minHeight: '100vh',
    padding: '28px 30px 34px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    backgroundColor: tokens.colorNeutralBackground2
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  dot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
  panel: { display: 'flex', flexDirection: 'column', gap: '14px' },
  row: { display: 'flex', gap: '8px', alignItems: 'flex-end' },
  grow: { flexGrow: 1 },
  muted: { color: tokens.colorNeutralForeground3 },
  actions: { display: 'flex', gap: '8px', marginTop: '4px' },
  mono: { fontFamily: 'Consolas, monospace', color: tokens.colorNeutralForeground3 }
})

const statusColor: Record<NodeStatusView['state'], string> = {
  running: '#5BC98B',
  starting: '#E2B33C',
  error: '#E86A6A',
  stopped: '#7A7A85'
}

function statusText(status: NodeStatusView, configured: boolean): string {
  switch (status.state) {
    case 'running':
      return 'Connected to Portal'
    case 'starting':
      return 'Connecting…'
    case 'error':
      return status.message
    default:
      return configured ? 'Stopped' : 'Not set up yet'
  }
}

export function App(): JSX.Element {
  const styles = useStyles()
  const [config, setConfig] = useState<NodeConfigView | null>(null)
  const [status, setStatus] = useState<NodeStatusView>({ state: 'stopped' })
  const [paired, setPaired] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.chunkforgeNode.getConfig().then(setConfig)
    void window.chunkforgeNode.getStatus().then(setStatus)
    void window.chunkforgeNode.hasPaired().then(setPaired)
    const offStatus = window.chunkforgeNode.onStatus(setStatus)
    const offConfig = window.chunkforgeNode.onConfig(setConfig)
    return () => {
      offStatus()
      offConfig()
    }
  }, [])

  if (!config) {
    return (
      <div className={styles.root}>
        <Spinner label="Loading…" />
      </div>
    )
  }

  const configured = Boolean(config.portalUrl.trim()) && (Boolean(config.pairingPin.trim()) || paired)

  function patch(next: Partial<NodeConfigView>): void {
    setConfig((prev) => (prev ? { ...prev, ...next } : prev))
  }

  async function save(): Promise<void> {
    if (!config) return
    setSaving(true)
    try {
      const result = await window.chunkforgeNode.save(config)
      setConfig(result.config)
      setStatus(result.status)
      setPaired(await window.chunkforgeNode.hasPaired())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.root}>
      <BrandLockup product="Node" />

      <div className={styles.statusRow}>
        <span className={styles.dot} style={{ backgroundColor: statusColor[status.state] }} />
        <Text weight="semibold">{statusText(status, configured)}</Text>
        {status.state === 'running' && (
          <Badge appearance="tint" color="success">
            hosting
          </Badge>
        )}
      </div>

      {status.state === 'running' && (
        <Text size={200} className={styles.mono}>
          node {status.nodeId}
        </Text>
      )}

      <Divider />

      <div className={styles.panel}>
        <Title2>Setup</Title2>
        <Field
          label="Portal address"
          hint="The Chunkforge Portal this machine should report to, e.g. https://portal.example.com"
        >
          <Input
            value={config.portalUrl}
            placeholder="https://portal.example.com"
            onChange={(_, data) => patch({ portalUrl: data.value })}
          />
        </Field>

        <Field
          label="Pairing pin"
          hint={
            paired
              ? 'Already paired. Only needed again if you detach this node from Portal.'
              : 'Generate one in Portal under Nodes. It is used once, then this machine remembers.'
          }
        >
          <Input
            value={config.pairingPin}
            placeholder={paired ? 'Paired' : 'ABCD-1234'}
            onChange={(_, data) => patch({ pairingPin: data.value })}
          />
        </Field>

        <Field label="Node name" hint="How this machine appears in Chunkforge.">
          <Input value={config.nodeName} onChange={(_, data) => patch({ nodeName: data.value })} />
        </Field>

        <Field label="Server files" hint="Worlds, jars, and this node's pairing live here.">
          <div className={styles.row}>
            <Input
              className={styles.grow}
              value={config.dataRoot}
              onChange={(_, data) => patch({ dataRoot: data.value })}
            />
            <Button
              onClick={async () => {
                const chosen = await window.chunkforgeNode.chooseDataRoot()
                if (chosen) patch({ dataRoot: chosen })
              }}
            >
              Browse
            </Button>
          </div>
        </Field>

        <Switch
          label="Start with Windows"
          checked={config.autoStart}
          onChange={(_, data) => patch({ autoStart: data.checked })}
        />
        <Text size={200} className={styles.muted}>
          Starts minimised to the tray. Closing this window leaves the node running; use Quit in the
          tray menu to stop it.
        </Text>

        <div className={styles.actions}>
          <Button
            appearance="primary"
            disabled={saving || !config.portalUrl.trim()}
            onClick={() => void save()}
          >
            {saving ? 'Applying…' : 'Save and connect'}
          </Button>
          {status.state === 'running' ? (
            <Button onClick={() => void window.chunkforgeNode.stop()}>Stop</Button>
          ) : (
            <Button disabled={!configured} onClick={() => void window.chunkforgeNode.start()}>
              Start
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
