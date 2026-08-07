import { useEffect, useState, type JSX } from 'react'
import { MessageBar, MessageBarBody, Spinner, Text, Title2, makeStyles, tokens } from '@fluentui/react-components'
import { onPortalEvent, portalApi } from '../api'
import type { PortalOverview } from '../../../src/types'

const useStyles = makeStyles({
  root: { padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '16px 18px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  label: { color: tokens.colorNeutralForeground3, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' },
  value: { fontSize: '26px', fontWeight: 600 },
  section: {
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  step: { color: tokens.colorNeutralForeground2 }
})

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function OverviewPage(): JSX.Element {
  const styles = useStyles()
  const [overview, setOverview] = useState<PortalOverview | null>(null)

  useEffect(() => {
    void portalApi.overview().then(setOverview)
    const interval = setInterval(() => void portalApi.overview().then(setOverview), 15_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => onPortalEvent('overview', setOverview), [])

  if (!overview) return <div className={styles.root}><Spinner label="Loading…" /></div>

  const zoneMissing = !overview.config.zoneSuffix
  const addressMissing = !overview.config.publicBaseUrl

  return (
    <div className={styles.root}>
      <div>
        <Title2>Overview</Title2>
        <Text className={styles.subtitle} block>
          This Portal hands out subdomains and proxies traffic to the nodes behind them.
        </Text>
      </div>

      {(zoneMissing || addressMissing) && (
        <MessageBar intent="warning">
          <MessageBarBody>
            {addressMissing && 'Portal does not know its own public address. '}
            {zoneMissing && 'No DNS zone is configured, so subdomains cannot be allocated. '}
            Set these under <strong>Settings</strong> before pairing anything.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.grid}>
        <Stat label="Nodes online" value={`${overview.onlineNodeCount} / ${overview.nodeCount}`} />
        <Stat label="Subdomains" value={String(overview.domainCount)} />
        <Stat label="Open tunnels" value={String(overview.activeTunnelCount)} />
        <Stat label="Control planes" value={String(overview.clientCount)} />
        <Stat label="Uptime" value={formatUptime(overview.uptimeSeconds)} />
      </div>

      <div className={styles.section}>
        <Text weight="semibold">How this fits together</Text>
        <Text className={styles.step} block>
          1. Run <strong>Chunkforge Desktop</strong> on your PC, or <strong>Chunkforge Web</strong> in
          your homelab. That is the interface where you actually create and manage servers.
        </Text>
        <Text className={styles.step} block>
          2. Generate a <strong>control plane pin</strong> under Control planes and enter it there, so
          it can reach this Portal.
        </Text>
        <Text className={styles.step} block>
          3. Generate a <strong>node pin</strong> under Nodes and give it to each machine that should
          run servers — your bedroom PC, a friend's Docker host, anything.
        </Text>
        <Text className={styles.step} block>
          4. Create a server from the Chunkforge UI and pick a node. Portal allocates its subdomain and
          opens the public port. Nothing needs a port opened on the node itself.
        </Text>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  const styles = useStyles()
  return (
    <div className={styles.stat}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  )
}
