import { useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Textarea,
  Field,
  MessageBar,
  MessageBarBody
} from '@fluentui/react-components'
import { Save20Regular, ArrowUndo20Regular } from '@fluentui/react-icons'
import { LAUNCH_TOKENS, type InstanceMetadata } from '@shared/types'
import { api } from '../../api'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    maxWidth: '660px'
  },
  title: { color: tokens.colorNeutralForeground2 },
  muted: { color: tokens.colorNeutralForeground3 },
  preview: {
    fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
    fontSize: '11.5px',
    lineHeight: '17px',
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '10px 12px',
    wordBreak: 'break-all'
  },
  editor: {
    '& textarea': {
      fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
      fontSize: '12px',
      lineHeight: '18px',
      minHeight: '150px'
    }
  },
  actions: { display: 'flex', gap: '8px' }
})

interface StartupPanelProps {
  metadata: InstanceMetadata
  onSaved: (updated: InstanceMetadata) => void
}

function toText(args: string[]): string {
  return args.join('\n')
}

export function StartupPanel({ metadata, onSaved }: StartupPanelProps): JSX.Element {
  const styles = useStyles()

  const initial =
    metadata.launchArgs ??
    [
      `-Xms${LAUNCH_TOKENS.minRam}M`,
      `-Xmx${LAUNCH_TOKENS.maxRam}M`,
      ...(metadata.jvmFlags ?? []),
      '-jar',
      'server.jar',
      'nogui'
    ]

  const [text, setText] = useState(toText(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const args = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const dirty = toText(args) !== toText(initial)

  const resolved = args.map((arg) =>
    arg
      .replaceAll(LAUNCH_TOKENS.minRam, String(metadata.minRamMb))
      .replaceAll(LAUNCH_TOKENS.maxRam, String(metadata.maxRamMb))
  )

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      const updated = await api().servers.update(metadata.id, { launchArgs: args })
      onSaved(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.panel}>
      <Text weight="semibold" className={styles.title}>
        Startup command
      </Text>
      <Text size={200} className={styles.muted}>
        One argument per line, passed to Java in order. {LAUNCH_TOKENS.minRam} and {LAUNCH_TOKENS.maxRam}{' '}
        are replaced with the memory values from this server&apos;s settings.
      </Text>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <Field label="Arguments">
        <Textarea className={styles.editor} value={text} onChange={(_, d) => setText(d.value)} />
      </Field>

      <Field label="Resolved command">
        <div className={styles.preview}>
          {(metadata.javaPath ?? 'java')} {resolved.join(' ')}
        </div>
      </Field>

      <div className={styles.actions}>
        <Button appearance="primary" icon={<Save20Regular />} disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save Startup'}
        </Button>
        <Button icon={<ArrowUndo20Regular />} disabled={!dirty} onClick={() => setText(toText(initial))}>
          Revert
        </Button>
      </div>
    </div>
  )
}
