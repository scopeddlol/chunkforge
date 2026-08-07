import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Spinner,
  Text,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { Add24Regular, PlugConnected24Regular } from '@fluentui/react-icons'
import type { BadgeProps } from '@fluentui/react-components'
import type { Node } from '@shared/types'
import { api, onEvent } from '../../api'

const useStyles = makeStyles({
  root: { flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '28px 36px', overflow: 'auto' },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '20px'
  },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' },
  card: { display: 'flex', flexDirection: 'column', gap: '14px' },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '10px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2
  },
  statLabel: { color: tokens.colorNeutralForeground3, fontSize: '11px', textTransform: 'uppercase' },
  empty: {
    padding: '22px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  dialogBody: { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '380px' },
  codeBox: {
    padding: '12px 14px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontFamily: 'Consolas, monospace',
    fontSize: '18px',
    letterSpacing: '1px'
  }
})

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit >= 3 ? 1 : 0)} ${units[unit]}`
}

function percent(used: number | undefined, total: number | undefined): string {
  if (!used || !total || total <= 0) return '—'
  return `${Math.round((used / total) * 100)}%`
}

function statusAppearance(status: Node['status']): BadgeProps['appearance'] {
  if (status === 'online') return 'filled'
  if (status === 'pairing') return 'tint'
  return 'outline'
}

function statusColor(status: Node['status']): BadgeProps['color'] {
  if (status === 'online') return 'success'
  if (status === 'pairing') return 'informative'
  return 'subtle'
}

export function NodesPage(): JSX.Element {
  const styles = useStyles()
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [pairDialogOpen, setPairDialogOpen] = useState(false)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [pairCode, setPairCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ name: string; pairingCode: string } | null>(null)
  const [nodeName, setNodeName] = useState('Chunkforge Node')
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setNodes(await api().nodes.list())
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => onEvent('node-updated', (node) => setNodes((prev) => prev?.map((entry) => (entry.id === node.id ? node : entry)) ?? [node])), [])

  const remoteNodes = useMemo(() => (nodes ?? []).filter((node) => node.kind === 'remote'), [nodes])

  async function submitPair(): Promise<void> {
    if (!pairCode.trim()) return
    setPairing(true)
    setError(null)
    try {
      await api().nodes.pair(pairCode)
      setPairCode('')
      setPairDialogOpen(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pair node.')
    } finally {
      setPairing(false)
    }
  }

  async function generateCode(): Promise<void> {
    setGenerating(true)
    setError(null)
    try {
      const created = await api().nodes.createPairingCode(nodeName.trim() || undefined)
      setGenerated({ name: created.node.name, pairingCode: created.pairingCode })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pairing code.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <Title2>Nodes</Title2>
          <Text className={styles.subtitle} block>
            Pair Docker nodes with a code, then track CPU, memory, and storage across your pool.
          </Text>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button icon={<PlugConnected24Regular />} onClick={() => setGeneratorOpen(true)}>
            Generate Pairing Code
          </Button>
          <Button appearance="primary" icon={<Add24Regular />} onClick={() => setPairDialogOpen(true)}>
            Add Node
          </Button>
        </div>
      </div>

      {!nodes && <Spinner label="Loading nodes…" />}

      {nodes && remoteNodes.length === 0 && (
        <div className={styles.empty}>
          <Text weight="semibold" block>
            No external nodes yet
          </Text>
          <Text block>
            Generate a pairing code on a Chunkforge Node, then add it here to attach that machine to this panel.
          </Text>
        </div>
      )}

      {remoteNodes.length > 0 && (
        <div className={styles.list}>
          {remoteNodes.map((node) => (
            <Card key={node.id} className={styles.card}>
              <CardHeader
                header={<Text weight="semibold">{node.name}</Text>}
                description={
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge appearance={statusAppearance(node.status)} color={statusColor(node.status)}>
                      {node.status}
                    </Badge>
                    <Text size={200}>
                      {node.lastSeenAt ? `Last seen ${new Date(node.lastSeenAt).toLocaleString()}` : 'Awaiting heartbeat'}
                    </Text>
                    {node.portal && (
                      <Text size={200}>
                        Portal {node.portal.connectionStatus}
                        {node.portal.lastHandshakeAt
                          ? ` · handshake ${new Date(node.portal.lastHandshakeAt).toLocaleTimeString()}`
                          : ''}
                      </Text>
                    )}
                  </div>
                }
              />

              <div className={styles.stats}>
                <div className={styles.stat}>
                  <Text className={styles.statLabel}>CPU</Text>
                  <Text>{node.stats ? `${node.stats.cpuPercent}% / ${node.stats.cpuCores} cores` : '—'}</Text>
                </div>
                <div className={styles.stat}>
                  <Text className={styles.statLabel}>Memory</Text>
                  <Text>
                    {node.stats
                      ? `${formatBytes(node.stats.usedMemoryBytes)} / ${formatBytes(node.stats.totalMemoryBytes)} (${percent(node.stats.usedMemoryBytes, node.stats.totalMemoryBytes)})`
                      : '—'}
                  </Text>
                </div>
                <div className={styles.stat}>
                  <Text className={styles.statLabel}>Storage</Text>
                  <Text>
                    {node.stats
                      ? `${formatBytes(node.stats.usedStorageBytes)} / ${formatBytes(node.stats.totalStorageBytes)} (${percent(node.stats.usedStorageBytes, node.stats.totalStorageBytes)})`
                      : '—'}
                  </Text>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={pairDialogOpen} onOpenChange={(_, data) => !data.open && setPairDialogOpen(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Add node</DialogTitle>
            <DialogContent className={styles.dialogBody}>
              <Field label="Pairing code" validationMessage={error ?? undefined}>
                <Input
                  value={pairCode}
                  placeholder="USE2-31FX"
                  onChange={(_, data) => setPairCode(data.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && pairCode.trim()) void submitPair()
                  }}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPairDialogOpen(false)}>Cancel</Button>
              <Button appearance="primary" disabled={!pairCode.trim() || pairing} onClick={() => void submitPair()}>
                {pairing ? 'Pairing…' : 'Add Node'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={generatorOpen}
        onOpenChange={(_, data) => {
          if (!data.open) {
            setGeneratorOpen(false)
            setGenerated(null)
            setError(null)
          }
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Generate node pairing code</DialogTitle>
            <DialogContent className={styles.dialogBody}>
              <Field label="Node name">
                <Input value={nodeName} onChange={(_, data) => setNodeName(data.value)} />
              </Field>
              {generated && (
                <>
                  <Text block>Use this code in the Chunkforge app to attach the node.</Text>
                  <div className={styles.codeBox}>{generated.pairingCode}</div>
                </>
              )}
              {error && <Text>{error}</Text>}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setGeneratorOpen(false)}>Close</Button>
              <Button appearance="primary" disabled={generating} onClick={() => void generateCode()}>
                {generating ? 'Generating…' : generated ? 'Generate Another' : 'Generate Code'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
