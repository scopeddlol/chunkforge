import { useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Field,
  Input,
  Spinner,
  Switch,
  Text,
  Title2,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { portalApi } from '../api'
import type { PortalConfigView } from '../../../src/types'

const useStyles = makeStyles({
  root: { padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  muted: { color: tokens.colorNeutralForeground3 },
  panel: {
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  row: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' },
  actions: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' },
  error: { color: tokens.colorPaletteRedForeground2 },
  ok: { color: tokens.colorPaletteGreenForeground2 }
})

export function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const [config, setConfig] = useState<PortalConfigView | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [password, setPassword] = useState('')
  const [cfToken, setCfToken] = useState('')
  const [cfBusy, setCfBusy] = useState(false)
  const [cfMessage, setCfMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    void portalApi.config.get().then(setConfig)
  }, [])

  function patch(next: Partial<PortalConfigView>): void {
    setConfig((prev) => (prev ? { ...prev, ...next } : prev))
  }

  async function save(): Promise<void> {
    if (!config) return
    setSaving(true)
    setMessage(null)
    try {
      // Sending a managed public URL back would 409; the server owns it.
      const { publicBaseUrlManaged, ...rest } = config
      const patchBody = publicBaseUrlManaged
        ? (({ publicBaseUrl: _managed, ...keep }) => keep)(rest)
        : rest
      setConfig(await portalApi.config.save(patchBody))
      setMessage({ text: 'Saved.', ok: true })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not save.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function connectCloudflare(): Promise<void> {
    setCfBusy(true)
    setCfMessage(null)
    try {
      setConfig(await portalApi.cloudflare.connect(cfToken.trim()))
      setCfToken('')
      setCfMessage({ text: 'Connected. The wildcard record has been published.', ok: true })
    } catch (err) {
      setCfMessage({ text: err instanceof Error ? err.message : 'Could not connect.', ok: false })
    } finally {
      setCfBusy(false)
    }
  }

  async function disconnectCloudflare(): Promise<void> {
    setCfBusy(true)
    setCfMessage(null)
    try {
      setConfig(await portalApi.cloudflare.disconnect())
      setCfMessage({ text: 'Disconnected. Records already published are left in place.', ok: true })
    } catch (err) {
      setCfMessage({ text: err instanceof Error ? err.message : 'Could not disconnect.', ok: false })
    } finally {
      setCfBusy(false)
    }
  }

  async function testCloudflare(): Promise<void> {
    setCfBusy(true)
    setCfMessage(null)
    try {
      const result = await portalApi.cloudflare.test()
      setCfMessage({ text: `Working — talking to zone "${result.zoneName}".`, ok: true })
    } catch (err) {
      setCfMessage({ text: err instanceof Error ? err.message : 'Connection failed.', ok: false })
    } finally {
      setCfBusy(false)
    }
  }

  async function resyncWildcard(): Promise<void> {
    setCfBusy(true)
    setCfMessage(null)
    try {
      await portalApi.cloudflare.syncWildcard()
      setCfMessage({ text: 'Wildcard record re-published.', ok: true })
    } catch (err) {
      setCfMessage({ text: err instanceof Error ? err.message : 'Could not publish it.', ok: false })
    } finally {
      setCfBusy(false)
    }
  }

  async function changePassword(): Promise<void> {
    setSaving(true)
    setMessage(null)
    try {
      await portalApi.auth.changePassword(password)
      setPassword('')
      setMessage({ text: 'Password changed.', ok: true })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not change password.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  if (!config) return <div className={styles.root}><Spinner label="Loading…" /></div>

  return (
    <div className={styles.root}>
      <div>
        <Title2>Settings</Title2>
        <Text className={styles.subtitle} block>
          How this Portal is reached, and the zone it allocates names under.
        </Text>
      </div>

      <div className={styles.panel}>
        <Field
          label="Public base URL"
          hint={
            config.publicBaseUrlManaged
              ? 'Set by CHUNKFORGE_PORTAL_DOMAIN on this deployment, so it always matches the certificate.'
              : 'How nodes and Chunkforge UIs reach this Portal, e.g. https://portal.example.com'
          }
        >
          <Input
            value={config.publicBaseUrl}
            placeholder="https://portal.example.com"
            disabled={config.publicBaseUrlManaged}
            onChange={(_, data) => patch({ publicBaseUrl: data.value })}
          />
        </Field>

        <Field
          label="Domain zone"
          hint="Subdomains are allocated under this, e.g. play.example.com gives survival.play.example.com"
        >
          <Input
            value={config.zoneSuffix}
            placeholder="play.example.com"
            onChange={(_, data) => patch({ zoneSuffix: data.value })}
          />
        </Field>

        <Switch
          label="Allocate public ports automatically"
          checked={config.autoAllocatePorts}
          onChange={(_, data) => patch({ autoAllocatePorts: data.checked })}
        />
        <Text size={200} className={styles.muted}>
          Every server is funnelled through this host, so each needs its own public port. Leave this on
          and Chunkforge never has to ask for one.
        </Text>

        <div className={styles.row}>
          <Field label="Port range start" style={{ flexGrow: 1 }}>
            <Input
              type="number"
              value={String(config.publicPortRangeStart)}
              onChange={(_, data) => patch({ publicPortRangeStart: Number(data.value) })}
            />
          </Field>
          <Field label="Port range end" style={{ flexGrow: 1 }}>
            <Input
              type="number"
              value={String(config.publicPortRangeEnd)}
              onChange={(_, data) => patch({ publicPortRangeEnd: Number(data.value) })}
            />
          </Field>
        </div>
        <Text size={200} className={styles.muted}>
          This whole range must be reachable on the Portal host — it is where player traffic lands.
        </Text>

        <Switch
          label="Trust reverse-proxy forwarding headers"
          checked={config.trustProxy}
          onChange={(_, data) => patch({ trustProxy: data.checked })}
        />

        <div className={styles.actions}>
          <Button appearance="primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {message && (
            <Text className={message.ok ? styles.ok : styles.error}>{message.text}</Text>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.headerRow}>
          <Text weight="semibold">Cloudflare DNS</Text>
          <Badge appearance="tint" color={config.cloudflareConfigured ? 'success' : 'informative'}>
            {config.cloudflareConfigured ? 'connected' : 'not connected'}
          </Badge>
        </div>
        <Text size={200} className={styles.muted}>
          Give Portal a Cloudflare API token and it publishes the wildcard record and every server's
          address itself — the Subdomains page stops asking you to copy anything. Without this, Portal
          keeps reporting the exact records to add by hand, which works everywhere but takes a step per
          server.
        </Text>

        {config.cloudflareApiTokenManaged && (
          <Text size={200} className={styles.muted}>
            Set by <code>CHUNKFORGE_CLOUDFLARE_API_TOKEN</code> on this deployment.
          </Text>
        )}

        {!config.cloudflareConfigured && !config.cloudflareApiTokenManaged && (
          <Field
            label="API token"
            hint="A Cloudflare token scoped to Zone → DNS → Edit for the zone above. Create one under My Profile → API Tokens."
          >
            <div className={styles.row}>
              <Input
                type="password"
                value={cfToken}
                placeholder="Paste the token"
                style={{ minWidth: '280px', flexGrow: 1 }}
                onChange={(_, data) => setCfToken(data.value)}
              />
              <Button
                appearance="primary"
                disabled={cfBusy || !cfToken.trim() || !config.zoneSuffix.trim()}
                onClick={() => void connectCloudflare()}
              >
                {cfBusy ? 'Connecting…' : 'Connect'}
              </Button>
            </div>
            {!config.zoneSuffix.trim() && (
              <Text size={200} className={styles.muted}>
                Set the domain zone above first — Portal needs it to find the right Cloudflare zone.
              </Text>
            )}
          </Field>
        )}

        {config.cloudflareConfigured && (
          <div className={styles.actions}>
            <Button disabled={cfBusy} onClick={() => void testCloudflare()}>
              Test Connection
            </Button>
            <Button disabled={cfBusy} onClick={() => void resyncWildcard()}>
              Re-publish Wildcard
            </Button>
            {!config.cloudflareApiTokenManaged && (
              <Button disabled={cfBusy} onClick={() => void disconnectCloudflare()}>
                Disconnect
              </Button>
            )}
          </div>
        )}

        {cfMessage && (
          <Text className={cfMessage.ok ? styles.ok : styles.error}>{cfMessage.text}</Text>
        )}
      </div>

      <div className={styles.panel}>
        <Text weight="semibold">Operator password</Text>
        <Field label="New password" hint="At least 8 characters.">
          <Input type="password" value={password} onChange={(_, data) => setPassword(data.value)} />
        </Field>
        <div className={styles.actions}>
          <Button disabled={saving || password.length < 8} onClick={() => void changePassword()}>
            Change Password
          </Button>
        </div>
      </div>
    </div>
  )
}
