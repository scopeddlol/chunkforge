import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Link,
  Spinner,
  Text,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { BadgeProps } from '@fluentui/react-components'
import type { AppSettings, Node } from '@shared/types'
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
  meta: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  empty: {
    padding: '22px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
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

function statusColor(status: Node['status']): BadgeProps['color'] {
  return status === 'online' ? 'success' : 'subtle'
}

/**
 * Nodes are paired at the Portal, not here — so this page has no "add node"
 * button. What it does have is adoption: a node visible on the Portal becomes
 * manageable from this Chunkforge once claimed, and a Portal shared between two
 * control planes will not let both claim the same machine.
 */
export function NodesPage(): JSX.Element {
  const styles = useStyles()
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [portal, setPortal] = useState<AppSettings['portal'] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    const [nextNodes, nextPortal] = await Promise.all([api().nodes.list(), api().portal.status()])
    setNodes(nextNodes)
    setPortal(nextPortal)
  }

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 20_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(
    () =>
      onEvent('node-updated', (node) =>
        setNodes((prev) => prev?.map((entry) => (entry.id === node.id ? node : entry)) ?? [node])
      ),
    []
  )

  const portalNodes = useMemo(() => (nodes ?? []).filter((node) => node.kind === 'portal'), [nodes])
  const linked = portal?.connectionStatus === 'connected'

  async function toggleClaim(node: Node): Promise<void> {
    setBusyId(node.id)
    setError(null)
    try {
      if (node.claimed) await api().nodes.release(node.id)
      else await api().nodes.claim(node.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change that node.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <Title2>Nodes</Title2>
          <Text className={styles.subtitle} block>
            Machines that run your servers. They are paired once at your Portal, then adopted here.
          </Text>
        </div>
      </div>

      {!nodes && <Spinner label="Loading nodes…" />}

      {nodes && !linked && (
        <div className={styles.empty}>
          <Text weight="semibold">No Portal attached</Text>
          <Text className={styles.muted}>
            Chunkforge reaches remote machines through a Portal. Attach one under Settings → Chunkforge
            Portal, then any node paired with it shows up here.
          </Text>
        </div>
      )}

      {nodes && linked && portalNodes.length === 0 && (
        <div className={styles.empty}>
          <Text weight="semibold">No nodes on this Portal yet</Text>
          <Text className={styles.muted}>
            Generate a node pin in the{' '}
            <Link href={portal?.portalUrl} target="_blank">
              Portal web interface
            </Link>{' '}
            and start a Chunkforge Node container with it.
          </Text>
        </div>
      )}

      {error && (
        <Text style={{ color: tokens.colorPaletteRedForeground2, marginBottom: '12px' }}>{error}</Text>
      )}

      {portalNodes.length > 0 && (
        <div className={styles.list}>
          {portalNodes.map((node) => (
            <Card key={node.id} className={styles.card}>
              <CardHeader
                header={<Text weight="semibold">{node.name}</Text>}
                description={
                  <div className={styles.meta}>
                    <Badge appearance={node.status === 'online' ? 'filled' : 'outline'} color={statusColor(node.status)}>
                      {node.status}
                    </Badge>
                    {node.claimed && (
                      <Badge appearance="tint" color="brand">
                        yours
                      </Badge>
                    )}
                    {node.claimedByOther && <Badge appearance="tint">claimed elsewhere</Badge>}
                    {node.claimed && !node.agentReady && (
                      <Badge appearance="tint" color="warning">
                        agent down
                      </Badge>
                    )}
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
                    appearance={node.claimed ? 'subtle' : 'primary'}
                    disabled={busyId === node.id || node.claimedByOther}
                    onClick={() => void toggleClaim(node)}
                  >
                    {busyId === node.id ? '…' : node.claimed ? 'Release' : 'Adopt'}
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

              {node.claimed && (
                <Text size={200} className={styles.muted}>
                  Servers you create on this node are managed from Chunkforge exactly like local ones.
                </Text>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
