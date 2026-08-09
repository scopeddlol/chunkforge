import { useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Field,
  Input,
  Link,
  Switch,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import type { AppSettings } from '@shared/types'
import { api, onEvent } from '../../api'
import { useSessionStore } from '../../state/sessionStore'

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
  error: { color: tokens.colorPaletteRedForeground2 },
  zone: {
    padding: '10px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    fontFamily: 'Consolas, monospace'
  }
})

interface PortalPanelProps {
  settings: AppSettings
  onPatch: (patch: Partial<AppSettings>) => void
}

/**
 * Attaching this Chunkforge to a Portal.
 *
 * Note what this panel no longer does: it does not configure a zone, a port
 * range, or a public address. Those belong to the Portal and are set in the
 * Portal's own web interface — this side only redeems a pin and then reports
 * what it was given.
 */
export function PortalPanel({ settings, onPatch }: PortalPanelProps): JSX.Element {
  const styles = useStyles()
  const portal = settings.portal
  const [portalUrl, setPortalUrl] = useState(portal.portalUrl)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setPortalUrl(portal.portalUrl), [portal.portalUrl])

  useEffect(
    () =>
      onEvent('portal-status', (next) => {
        onPatch({ portal: next })
        setPortalUrl(next.portalUrl)
      }),
    [onPatch]
  )

  const linked = portal.connectionStatus === 'connected' && Boolean(portal.clientId)
  const [hostBusy, setHostBusy] = useState(false)
  const [hostError, setHostError] = useState<string | null>(null)

  async function connect(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const next = await api().portal.connect(portalUrl, pin, 'Chunkforge Desktop', 'desktop')
      onPatch({ portal: next })
      setPin('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pair with that Portal.')
    } finally {
      setBusy(false)
    }
  }

  // Disabled rather than hidden: someone who cannot do this should be able to
  // see that the capability exists and that it is a permission, not a missing
  // feature — otherwise the only way to learn is to ask why their machine is
  // not an option anywhere.
  const mayHostLocally = useSessionStore((s) => s.user?.canConfigurePersonalNode ?? false)

  async function setHostLocally(enabled: boolean): Promise<void> {
    setHostBusy(true)
    setHostError(null)
    try {
      onPatch({ portal: await api().portal.hostLocally(enabled) })
    } catch (err) {
      setHostError(err instanceof Error ? err.message : 'Could not change hosting for this machine.')
    } finally {
      setHostBusy(false)
    }
  }

  async function disconnect(): Promise<void> {
    setBusy(true)
    try {
      onPatch({ portal: await api().portal.disconnect() })
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
        <Badge appearance="tint" color={linked ? 'success' : 'informative'}>
          {portal.connectionStatus}
        </Badge>
      </div>
      <Text size={200} className={styles.muted}>
        Attach this Chunkforge to a Portal to deploy servers onto remote nodes and get an address for
        each one automatically. Without a Portal, Chunkforge still runs servers on this machine.
      </Text>

      <Field label="Portal URL" hint="Where your Portal is reachable, e.g. https://portal.example.com">
        <Input
          value={portalUrl}
          placeholder="https://portal.example.com"
          disabled={linked}
          onChange={(_, data) => setPortalUrl(data.value)}
        />
      </Field>

      {linked ? (
        <>
          <Field label="Subdomain zone">
            <div className={styles.zone}>
              {portal.zoneSuffix ? `<server>.${portal.zoneSuffix}` : 'No zone set on the Portal yet'}
            </div>
          </Field>
          <Text size={200} className={styles.muted}>
            Paired{portal.connectedAt ? ` ${new Date(portal.connectedAt).toLocaleString()}` : ''}. Manage
            nodes, subdomains, and pins in the{' '}
            <Link href={portal.portalUrl} target="_blank">
              Portal web interface
            </Link>
            .
          </Text>
          <div className={styles.row}>
            <Button onClick={() => void api().portal.refresh().then((next) => onPatch({ portal: next }))}>
              Refresh
            </Button>
            <Button disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <Field
          label="Pairing pin"
          hint="Generate one in the Portal web interface under Control planes."
          validationMessage={error ?? undefined}
        >
          <div className={styles.row}>
            <Input
              value={pin}
              placeholder="ABCD-2345"
              onChange={(_, data) => setPin(data.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && pin && portalUrl) void connect()
              }}
            />
            <Button
              appearance="primary"
              disabled={busy || !pin.trim() || !portalUrl.trim()}
              onClick={() => void connect()}
            >
              {busy ? 'Pairing…' : 'Connect'}
            </Button>
          </div>
        </Field>
      )}

      {portal.lastError && !linked && <Text className={styles.error}>{portal.lastError}</Text>}

      <Switch
        label="Give every server on a node its own subdomain"
        checked={portal.autoProvisionSubdomains}
        onChange={(_, data) =>
          onPatch({ portal: { ...portal, autoProvisionSubdomains: data.checked } })
        }
      />
      <Text size={200} className={styles.muted}>
        On by default. Turning it off means servers created on nodes have no public address until you
        provision one by hand from the server's Settings tab.
      </Text>

      <Switch
        label="Host servers on this machine"
        disabled={!linked || hostBusy || !mayHostLocally}
        checked={Boolean(portal.hostServersLocally)}
        onChange={(_, data) => void setHostLocally(data.checked)}
      />
      <Text size={200} className={styles.muted}>
        {mayHostLocally
          ? 'Offers this computer to your Portal as a node, so servers you run here get a subdomain like any other. Portal reaches them through the same outbound connection a remote node uses — no port forwarding, and nothing listening on your router.'
          : 'An admin has not allowed this account to offer its own machine as a node. Ask them to enable it if you need to run servers here.'}
      </Text>
      {hostError && <Text className={styles.error}>{hostError}</Text>}
    </div>
  )
}
