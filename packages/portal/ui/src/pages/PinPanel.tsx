import { useEffect, useState, type JSX } from 'react'
import { Badge, Button, Field, Input, Text, makeStyles, tokens } from '@fluentui/react-components'
import { portalApi } from '../api'
import type { PortalPin } from '../../../src/types'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '18px 20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  muted: { color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' },
  pinList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  pinRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2
  },
  code: { fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: '17px', letterSpacing: '1px' },
  spacer: { flexGrow: 1 },
  error: { color: tokens.colorPaletteRedForeground2 }
})

interface PinPanelProps {
  kind: 'node' | 'client'
  title: string
  description: string
  placeholder: string
}

/**
 * Pins are how anything attaches to a Portal. They expire, they are
 * single-use, and a node pin cannot be redeemed as a control plane — so a code
 * you read out over voice chat to a friend hosting a node can only ever make
 * them a node.
 */
export function PinPanel({ kind, title, description, placeholder }: PinPanelProps): JSX.Element {
  const styles = useStyles()
  const [pins, setPins] = useState<PortalPin[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    const all = await portalApi.pins.list()
    setPins(all.filter((pin) => pin.kind === kind))
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await portalApi.pins.create(kind, label.trim() || undefined)
      setLabel('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a pin.')
    } finally {
      setBusy(false)
    }
  }

  const live = pins.filter((pin) => !pin.usedAt && Date.parse(pin.expiresAt) > Date.now())

  return (
    <div className={styles.panel}>
      <div>
        <Text weight="semibold">{title}</Text>
        <Text size={200} block className={styles.muted}>
          {description}
        </Text>
      </div>

      <div className={styles.row}>
        <Field label="Label (optional)" style={{ minWidth: '240px' }}>
          <Input value={label} placeholder={placeholder} onChange={(_, data) => setLabel(data.value)} />
        </Field>
        <Button appearance="primary" disabled={busy} onClick={() => void create()}>
          {busy ? 'Generating…' : 'Generate Pin'}
        </Button>
      </div>

      {error && <Text className={styles.error}>{error}</Text>}

      {live.length === 0 ? (
        <Text size={200} className={styles.muted}>
          No pins waiting to be redeemed.
        </Text>
      ) : (
        <div className={styles.pinList}>
          {live.map((pin) => (
            <div key={pin.code} className={styles.pinRow}>
              <span className={styles.code}>{pin.code}</span>
              {pin.label && <Badge appearance="tint">{pin.label}</Badge>}
              <span className={styles.spacer} />
              <Text size={200} className={styles.muted}>
                expires {new Date(pin.expiresAt).toLocaleTimeString()}
              </Text>
              <Button
                size="small"
                appearance="subtle"
                onClick={() => void portalApi.pins.remove(pin.code).then(refresh)}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
