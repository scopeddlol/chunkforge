import { useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Spinner,
  Text,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { formatBytes, onPortalEvent, portalApi } from '../api'
import { PinPanel } from './PinPanel'
import type { PortalNodeView } from '../../../src/types'

const useStyles = makeStyles({
  root: { padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '14px' },
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
  tunnels: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  meta: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  empty: {
    padding: '22px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  }
})

export function NodesPage(): JSX.Element {
  const styles = useStyles()
  const [nodes, setNodes] = useState<PortalNodeView[] | null>(null)

  async function refresh(): Promise<void> {
    setNodes(await portalApi.nodes.list())
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(
    () =>
      onPortalEvent('node-updated', (node) =>
        setNodes((prev) => {
          if (!prev) return [node]
          const index = prev.findIndex((entry) => entry.id === node.id)
          if (index < 0) return [...prev, node]
          const next = [...prev]
          next[index] = node
          return next
        })
      ),
    []
  )

  useEffect(
    () =>
      onPortalEvent('node-removed', ({ id }) =>
        setNodes((prev) => prev?.filter((node) => node.id !== id) ?? null)
      ),
    []
  )

  return (
    <div className={styles.root}>
      <div>
        <Title2>Nodes</Title2>
        <Text className={styles.subtitle} block>
          Machines that run Minecraft servers. Each one holds a single outbound connection to this
          Portal — none of them accept inbound traffic directly.
        </Text>
      </div>

      <PinPanel
        kind="node"
        title="Node pairing pins"
        description="Give one of these to a machine you want to host servers on. It goes in CHUNKFORGE_PAIRING_PIN."
        placeholder="Basement box"
      />

      {!nodes && <Spinner label="Loading nodes…" />}

      {nodes && nodes.length === 0 && (
        <div className={styles.empty}>
          <Text weight="semibold" block>
            No nodes paired yet
          </Text>
          <Text block className={styles.muted}>
            Generate a pin above, then start a Chunkforge Node container with it.
          </Text>
        </div>
      )}

      {nodes && nodes.length > 0 && (
        <div className={styles.list}>
          {nodes.map((node) => (
            <Card key={node.id} className={styles.card}>
              <CardHeader
                header={<Text weight="semibold">{node.name}</Text>}
                description={
                  <div className={styles.meta}>
                    <Badge
                      appearance={node.status === 'online' ? 'filled' : 'outline'}
                      color={node.status === 'online' ? 'success' : 'subtle'}
                    >
                      {node.status}
                    </Badge>
                    <Badge appearance="tint" color={node.agentReady ? 'brand' : 'subtle'}>
                      {node.agentReady ? 'manageable' : 'agent down'}
                    </Badge>
                    {node.claimedByOther && <Badge appearance="tint">claimed elsewhere</Badge>}
                    <Text size={200} className={styles.muted}>
                      {node.lastSeenAt
                        ? `seen ${new Date(node.lastSeenAt).toLocaleTimeString()}`
                        : 'awaiting heartbeat'}
                    </Text>
                  </div>
                }
                action={
                  <Button
                    size="small"
                    appearance="subtle"
                    onClick={() => void portalApi.nodes.remove(node.id).then(refresh)}
                  >
                    Remove
                  </Button>
                }
              />

              <div className={styles.stats}>
                <div className={styles.stat}>
                  <Text className={styles.statLabel}>CPU</Text>
                  <Text>{node.stats ? `${node.stats.cpuPercent}% · ${node.stats.cpuCores}c` : '—'}</Text>
                </div>
                <div className={styles.stat}>
                  <Text className={styles.statLabel}>Memory</Text>
                  <Text>
                    {node.stats
                      ? `${formatBytes(node.stats.usedMemoryBytes)} / ${formatBytes(node.stats.totalMemoryBytes)}`
                      : '—'}
                  </Text>
                </div>
                <div className={styles.stat}>
                  <Text className={styles.statLabel}>Storage</Text>
                  <Text>
                    {node.stats
                      ? `${formatBytes(node.stats.usedStorageBytes)} / ${formatBytes(node.stats.totalStorageBytes)}`
                      : '—'}
                  </Text>
                </div>
              </div>

              <div>
                <Text className={styles.statLabel} block>
                  Open routes
                </Text>
                {node.tunnels.length === 0 ? (
                  <Text size={200} className={styles.muted}>
                    None yet — routes appear as servers get subdomains.
                  </Text>
                ) : (
                  <div className={styles.tunnels}>
                    {node.tunnels.map((tunnel) => (
                      <Badge key={tunnel.id} appearance="outline">
                        {tunnel.protocol.toUpperCase()} {tunnel.publicPort} → {tunnel.targetPort}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
