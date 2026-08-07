import { useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { onPortalEvent, portalApi } from '../api'
import type { PortalConfig, PortalDomain, PortalNodeView } from '../../../src/types'

const useStyles = makeStyles({
  root: { padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  muted: { color: tokens.colorNeutralForeground3 },
  mono: { fontFamily: 'Cascadia Mono, Consolas, monospace' },
  panel: {
    padding: '18px 20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  record: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    flexWrap: 'wrap'
  },
  scroller: { overflowX: 'auto' },
  empty: {
    padding: '22px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  }
})

function portalHostFrom(config: PortalConfig): string {
  if (!config.publicBaseUrl.trim()) return ''
  try {
    return new URL(config.publicBaseUrl).hostname
  } catch {
    return ''
  }
}

export function DomainsPage(): JSX.Element {
  const styles = useStyles()
  const [domains, setDomains] = useState<PortalDomain[] | null>(null)
  const [nodes, setNodes] = useState<PortalNodeView[]>([])
  const [config, setConfig] = useState<PortalConfig | null>(null)

  async function refresh(): Promise<void> {
    const [nextDomains, nextNodes, nextConfig] = await Promise.all([
      portalApi.domains.list(),
      portalApi.nodes.list(),
      portalApi.config.get()
    ])
    setDomains(nextDomains)
    setNodes(nextNodes)
    setConfig(nextConfig)
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => onPortalEvent('domain-updated', () => void refresh()), [])
  useEffect(() => onPortalEvent('domain-removed', () => void refresh()), [])

  const zone = config?.zoneSuffix ?? ''
  const portalHost = config ? portalHostFrom(config) : ''

  return (
    <div className={styles.root}>
      <div>
        <Title2>Subdomains</Title2>
        <Text className={styles.subtitle} block>
          Allocated automatically when a server is created from Chunkforge. Each one maps a name onto a
          public port here, forwarded to the node that runs the server.
        </Text>
      </div>

      {config && !zone && (
        <MessageBar intent="warning">
          <MessageBarBody>
            No zone is configured. Set a <strong>domain zone</strong> under Settings before creating
            servers, or Chunkforge cannot request names.
          </MessageBarBody>
        </MessageBar>
      )}

      {zone && (
        <div className={styles.panel}>
          <Text weight="semibold">Publish this once</Text>
          <Text size={200} className={styles.muted}>
            A wildcard record covers every subdomain this Portal will ever allocate, so adding a server
            later needs no DNS work beyond its SRV record.
          </Text>
          <div className={styles.record}>
            <Badge appearance="filled">A</Badge>
            <span className={styles.mono}>*.{zone}</span>
            <span className={styles.muted}>→</span>
            <span className={styles.mono}>{portalHost || '<this Portal’s public IP>'}</span>
          </div>
        </div>
      )}

      {!domains && <Spinner label="Loading subdomains…" />}

      {domains && domains.length === 0 && (
        <div className={styles.empty}>
          <Text weight="semibold" block>
            Nothing allocated yet
          </Text>
          <Text block className={styles.muted}>
            Create a server in Chunkforge Desktop or Chunkforge Web and pick one of your nodes — its
            address shows up here.
          </Text>
        </div>
      )}

      {domains && domains.length > 0 && (
        <div className={styles.scroller}>
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Hostname</TableHeaderCell>
                <TableHeaderCell>Node</TableHeaderCell>
                <TableHeaderCell>Route</TableHeaderCell>
                <TableHeaderCell>SRV record to publish</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.hostname}>
                  <TableCell>
                    <span className={styles.mono}>{domain.hostname}</span>
                  </TableCell>
                  <TableCell>
                    {nodes.find((node) => node.id === domain.nodeId)?.name ?? (
                      <span className={styles.muted}>unknown</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge appearance="outline">
                      {domain.protocol.toUpperCase()} {domain.publicPort} → {domain.targetPort}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {domain.protocol === 'tcp' ? (
                      <span className={styles.mono}>
                        _minecraft._tcp.{domain.hostname} 0 0 {domain.publicPort} {domain.hostname}
                      </span>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      appearance="subtle"
                      onClick={() => void portalApi.domains.remove(domain.hostname).then(refresh)}
                    >
                      Release
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
