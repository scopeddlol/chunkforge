import { useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Field,
  Input,
  Link,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { Open16Regular } from '@fluentui/react-icons'
import { api } from '../../api'
import { native } from '../../native'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '10px' },
  state: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  row: { display: 'flex', gap: '8px', alignItems: 'flex-end' },
  grow: { flexGrow: 1 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  good: { color: tokens.colorPaletteGreenForeground1, fontSize: '12px' },
  bad: { color: tokens.colorPaletteRedForeground1, fontSize: '12px' }
})

/**
 * The saved key is never sent back to the browser — the API replaces it with a
 * placeholder — so this shows *whether* a key is set rather than pretending to
 * show the key. Putting the placeholder in a password box, as this used to,
 * meant the field displayed a value that was not the credential and could not
 * be meaningfully edited.
 */
const MASK = '__SET__'

interface CurseForgeKeyFieldProps {
  /** The value from settings: the mask when set, empty when not. */
  value: string
  onChange: (value: string) => void
}

export function CurseForgeKeyField({ value, onChange }: CurseForgeKeyFieldProps): JSX.Element {
  const styles = useStyles()
  const savedKeyExists = value === MASK
  const [editing, setEditing] = useState(!savedKeyExists)
  const [result, setResult] = useState<{ valid: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  async function test(): Promise<void> {
    setTesting(true)
    setResult(null)
    try {
      // An unsaved draft is tested as typed; otherwise the saved key is.
      const status = await api().settings.testCurseForgeKey(value === MASK ? undefined : value)
      setResult({ valid: status.valid, message: status.message })
    } catch (err) {
      setResult({ valid: false, message: err instanceof Error ? err.message : 'Could not test the key.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.root}>
      <Field
        label="CurseForge API key"
        hint="CurseForge requires a free personal key for third-party apps. Without one, CurseForge results stay disabled and CurseForge modpacks cannot be installed."
      >
        {savedKeyExists && !editing ? (
          <div className={styles.state}>
            <Badge appearance="tint" color="success">
              Key saved
            </Badge>
            <Button size="small" onClick={() => { setEditing(true); onChange('') }}>
              Replace
            </Button>
            <Button size="small" onClick={() => { onChange(''); setEditing(true); setResult(null) }}>
              Remove
            </Button>
            <Button size="small" disabled={testing} onClick={() => void test()}>
              {testing ? 'Testing…' : 'Test key'}
            </Button>
          </div>
        ) : (
          <div className={styles.row}>
            <Input
              className={styles.grow}
              type="password"
              placeholder={savedKeyExists ? 'Paste a replacement key…' : 'Paste your key…'}
              value={value === MASK ? '' : value}
              onChange={(_, d) => { onChange(d.value); setResult(null) }}
            />
            <Button disabled={testing || !value || value === MASK} onClick={() => void test()}>
              {testing ? 'Testing…' : 'Test'}
            </Button>
          </div>
        )}
      </Field>

      {result && (
        <Text className={result.valid ? styles.good : styles.bad}>{result.message}</Text>
      )}
      {!savedKeyExists && !value && (
        <Text className={styles.muted}>
          Remember to save after pasting a key — testing alone does not store it.
        </Text>
      )}

      <Link appearance="subtle" onClick={() => native().openExternal('https://console.curseforge.com/')}>
        Get a key at console.curseforge.com <Open16Regular />
      </Link>
    </div>
  )
}
