import { useEffect, useState, type JSX } from 'react'
import { Badge, Button, Field, Input, Switch, Text, makeStyles, tokens } from '@fluentui/react-components'
import type { AppSettings } from '@shared/types'
import { api, onEvent } from '../../api'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  title: { color: tokens.colorNeutralForeground2 },
  muted: { color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
  codeBox: {
    minWidth: '150px',
    padding: '10px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontFamily: 'Consolas, monospace',
    fontSize: '16px',
    letterSpacing: '1px'
  }
})

interface PortalPanelProps {
  settings: AppSettings
  onPatch: (patch: Partial<AppSettings>) => void
}

export function PortalPanel({ settings, onPatch }: PortalPanelProps): JSX.Element {
  const styles = useStyles()
  const portal = settings.portal
  const [desktopPin, setDesktopPin] = useState(portal.desktopConnectorPin)
  const [busy, setBusy] = useState(false)

  useEffect(() => setDesktopPin(portal.desktopConnectorPin), [portal.desktopConnectorPin])

  useEffect(() => onEvent('portal-status', (next) => setDesktopPin(next.desktopConnectorPin)), [])

  function patchPortal(patch: Partial<AppSettings['portal']>): void {
    onPatch({ portal: { ...portal, ...patch } })
  }

  async function generatePin(): Promise<void> {
    setBusy(true)
    try {
      const result = await api().portal.createDesktopPin()
      patchPortal(result.portal)
      setDesktopPin(result.pin)
    } finally {
      setBusy(false)
    }
  }

  async function connectDesktop(): Promise<void> {
    if (!desktopPin.trim()) return
    setBusy(true)
    try {
      const next = await api().portal.connectDesktop(desktopPin)
      patchPortal(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.headerRow}>
        <Text weight="semibold" className={styles.title}>
          Chunkforge Portal
        </Text>
        <Badge appearance="tint" color={portal.connectionStatus === 'connected' ? 'success' : 'informative'}>
          {portal.connectionStatus}
        </Badge>
      </div>
      <Text size={200} className={styles.muted}>
        Configure the self-hosted proxy panel your remote nodes and external clients connect through.
      </Text>

      <Switch
        label="Enable Portal integration"
        checked={portal.enabled}
        onChange={(_, data) => patchPortal({ enabled: data.checked })}
      />

      <Field label="Public panel URL" hint="e.g. https://panel.example.com">
        <Input
          value={portal.publicBaseUrl}
          placeholder="https://panel.example.com"
          onChange={(_, data) => patchPortal({ publicBaseUrl: data.value })}
        />
      </Field>

      <Field label="Relay URL" hint="e.g. wss://relay.example.com">
        <Input
          value={portal.relayBaseUrl}
          placeholder="wss://relay.example.com"
          onChange={(_, data) => patchPortal({ relayBaseUrl: data.value })}
        />
      </Field>

      <Field label="Default domain suffix" hint="e.g. play.example.com">
        <Input
          value={portal.defaultDomainSuffix}
          placeholder="play.example.com"
          onChange={(_, data) => patchPortal({ defaultDomainSuffix: data.value })}
        />
      </Field>

      <Switch
        label="Auto-provision subdomains"
        checked={portal.autoProvisionSubdomains}
        onChange={(_, data) => patchPortal({ autoProvisionSubdomains: data.checked })}
      />

      <Field label="Desktop/Web connector pin" hint="Use this pin when linking the panel to your hosted Portal.">
        <div className={styles.row}>
          <div className={styles.codeBox}>{desktopPin || 'Not generated yet'}</div>
          <Button onClick={() => void generatePin()} disabled={busy}>
            {busy ? 'Working…' : desktopPin ? 'Rotate Pin' : 'Generate Pin'}
          </Button>
          <Button appearance="primary" onClick={() => void connectDesktop()} disabled={busy || !desktopPin}>
            Mark Connected
          </Button>
        </div>
      </Field>

      <Text size={200} className={styles.muted}>
        Portal status: {portal.connectionStatus}
        {portal.connectedAt ? ` — connected ${new Date(portal.connectedAt).toLocaleString()}` : ''}
      </Text>

      <Switch
        label="Trust reverse-proxy forwarding headers"
        checked={portal.trustProxy}
        onChange={(_, data) => patchPortal({ trustProxy: data.checked })}
      />
    </div>
  )
}
