import { useEffect, useState, type JSX } from 'react'
import {
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
import type { PortalConfig } from '../../../src/types'

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
  row: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  actions: { display: 'flex', gap: '10px', alignItems: 'center' },
  error: { color: tokens.colorPaletteRedForeground2 },
  ok: { color: tokens.colorPaletteGreenForeground2 }
})

export function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const [config, setConfig] = useState<PortalConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [password, setPassword] = useState('')

  useEffect(() => {
    void portalApi.config.get().then(setConfig)
  }, [])

  function patch(next: Partial<PortalConfig>): void {
    setConfig((prev) => (prev ? { ...prev, ...next } : prev))
  }

  async function save(): Promise<void> {
    if (!config) return
    setSaving(true)
    setMessage(null)
    try {
      setConfig(await portalApi.config.save(config))
      setMessage({ text: 'Saved.', ok: true })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not save.', ok: false })
    } finally {
      setSaving(false)
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
          hint="How nodes and Chunkforge UIs reach this Portal, e.g. https://portal.example.com"
        >
          <Input
            value={config.publicBaseUrl}
            placeholder="https://portal.example.com"
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
