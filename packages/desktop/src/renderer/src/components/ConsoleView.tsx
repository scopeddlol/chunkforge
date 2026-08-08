import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { makeStyles, tokens, Input, Button } from '@fluentui/react-components'
import { Send24Regular } from '@fluentui/react-icons'
import type { LogLineEvent } from '@shared/types'
import { api, onEvent } from '../api'

const FALLBACK_MAX_LINES = 2000

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minHeight: 0,
    gap: '10px'
  },
  logPanel: {
    flexGrow: 1,
    overflowY: 'auto',
    backgroundColor: '#000000',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: '12px 14px',
    fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
    fontSize: '12.5px',
    lineHeight: '19px',
    color: '#D8D8DA'
  },
  line: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  stderr: {
    color: '#F2A87C'
  },
  system: {
    color: '#8A8886',
    fontStyle: 'italic'
  },
  inputRow: {
    display: 'flex',
    gap: '8px'
  },
  input: {
    flexGrow: 1
  }
})

interface ConsoleViewProps {
  instanceId: string
  canSendCommands: boolean
}

export function ConsoleView({ instanceId, canSendCommands }: ConsoleViewProps): JSX.Element {
  const styles = useStyles()
  const [lines, setLines] = useState<LogLineEvent[]>([])
  const [command, setCommand] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  // Read through a ref so changing the setting doesn't resubscribe the log stream.
  const maxLinesRef = useRef(FALLBACK_MAX_LINES)

  useEffect(() => {
    api()
      .settings.get()
      .then((settings) => {
        maxLinesRef.current = settings.consoleScrollbackLines || FALLBACK_MAX_LINES
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLines([])

    // Backlog first, then follow live. Lines that arrive while the history is
    // still in flight are kept: they are appended to whatever the fetch
    // returns rather than replacing it, so nothing printed during the gap is
    // lost and the panel never flashes empty on the way in.
    void api()
      .servers.logs(instanceId, maxLinesRef.current)
      .then((history) => {
        if (cancelled) return
        setLines((live) => {
          const merged = [...history, ...live]
          const max = maxLinesRef.current
          return merged.length > max ? merged.slice(merged.length - max) : merged
        })
      })
      .catch(() => undefined)

    const unsubscribe = onEvent('log', (event) => {
      if (event.instanceId !== instanceId) return
      setLines((prev) => {
        const next = [...prev, event]
        const max = maxLinesRef.current
        return next.length > max ? next.slice(next.length - max) : next
      })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [instanceId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  function submitCommand(): void {
    const trimmed = command.trim()
    if (!trimmed) return
    void api().servers.command(instanceId, trimmed)
    setCommand('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') submitCommand()
  }

  return (
    <div className={styles.root}>
      <div className={styles.logPanel} ref={scrollRef}>
        {lines.map((line, index) => (
          <div
            key={index}
            className={`${styles.line} ${line.stream === 'stderr' ? styles.stderr : ''} ${
              line.stream === 'system' ? styles.system : ''
            }`}
          >
            {line.line.replace(/\n+$/, '')}
          </div>
        ))}
      </div>
      <div className={styles.inputRow}>
        <Input
          className={styles.input}
          placeholder={canSendCommands ? 'Type a command…' : 'Server must be running to send commands'}
          value={command}
          disabled={!canSendCommands}
          onChange={(_, data) => setCommand(data.value)}
          onKeyDown={handleKeyDown}
        />
        <Button icon={<Send24Regular />} disabled={!canSendCommands} onClick={submitCommand}>
          Send
        </Button>
      </div>
    </div>
  )
}
