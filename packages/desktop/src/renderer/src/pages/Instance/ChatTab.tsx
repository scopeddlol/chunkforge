import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { makeStyles, tokens, Text, Input, Button, mergeClasses } from '@fluentui/react-components'
import { Send20Regular, Chat24Regular } from '@fluentui/react-icons'
import type { ChatMessage } from '@shared/types'
import { api, onEvent } from '../../api'

const MAX_MESSAGES = 500

// Server log formats we care about, all prefixed by "[HH:MM:SS] [thread/INFO]: ".
const CHAT_PATTERN = /\]: <([A-Za-z0-9_]{1,16})> (.+)$/
const JOIN_PATTERN = /\]: ([A-Za-z0-9_]{1,16}) joined the game/
const LEAVE_PATTERN = /\]: ([A-Za-z0-9_]{1,16}) left the game/
const SAY_PATTERN = /\]: \[Server\] (.+)$/

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '10px', flexGrow: 1, minHeight: 0 },
  feed: {
    flexGrow: 1,
    overflowY: 'auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '14px 16px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2
  },
  line: { display: 'flex', gap: '8px', alignItems: 'baseline', padding: '3px 0' },
  time: { color: tokens.colorNeutralForeground4, fontSize: '11px', flexShrink: 0, minWidth: '52px' },
  author: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  text: { color: tokens.colorNeutralForeground1, wordBreak: 'break-word' },
  system: { color: tokens.colorNeutralForeground3, fontStyle: 'italic' },
  joinText: { color: tokens.colorPaletteGreenForeground2 },
  leaveText: { color: tokens.colorNeutralForeground3 },
  serverText: { color: tokens.colorPaletteYellowForeground2 },
  inputRow: { display: 'flex', gap: '8px' },
  grow: { flexGrow: 1 },
  empty: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    color: tokens.colorNeutralForeground3,
    textAlign: 'center'
  }
})

function parseLine(line: string, seq: number): ChatMessage | null {
  const timestamp = Date.now()
  const chat = line.match(CHAT_PATTERN)
  if (chat) {
    return { id: `${timestamp}-${seq}`, kind: 'chat', author: chat[1], text: chat[2], timestamp }
  }
  const joined = line.match(JOIN_PATTERN)
  if (joined) {
    return { id: `${timestamp}-${seq}`, kind: 'join', author: joined[1], text: 'joined the game', timestamp }
  }
  const left = line.match(LEAVE_PATTERN)
  if (left) {
    return { id: `${timestamp}-${seq}`, kind: 'leave', author: left[1], text: 'left the game', timestamp }
  }
  const say = line.match(SAY_PATTERN)
  if (say) {
    return { id: `${timestamp}-${seq}`, kind: 'server', author: 'Server', text: say[1], timestamp }
  }
  return null
}

interface ChatTabProps {
  instanceId: string
  serverRunning: boolean
}

export function ChatTab({ instanceId, serverRunning }: ChatTabProps): JSX.Element {
  const styles = useStyles()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const feedRef = useRef<HTMLDivElement>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    setMessages([])
    return onEvent('log', (event) => {
      if (event.instanceId !== instanceId) return
      const parsed: ChatMessage[] = []
      for (const line of event.line.split('\n')) {
        const message = parseLine(line, seqRef.current++)
        if (message) parsed.push(message)
      }
      if (parsed.length === 0) return
      setMessages((prev) => {
        const next = [...prev, ...parsed]
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
      })
    })
  }, [instanceId])

  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  function send(): void {
    const text = draft.trim()
    if (!text) return
    void api().players.say(instanceId, text)
    setDraft('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') send()
  }

  return (
    <div className={styles.root}>
      <div className={styles.feed} ref={feedRef}>
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <Chat24Regular fontSize={32} />
            <Text>
              {serverRunning
                ? 'No chat yet. Player messages, joins, and leaves appear here live.'
                : 'Start the server to see in-game chat.'}
            </Text>
          </div>
        ) : (
          messages.map((message) => (
            <div className={styles.line} key={message.id}>
              <Text className={styles.time}>
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
              {message.kind === 'chat' && (
                <>
                  <Text weight="semibold" className={styles.author}>
                    {message.author}
                  </Text>
                  <Text className={styles.text}>{message.text}</Text>
                </>
              )}
              {message.kind !== 'chat' && (
                <Text
                  className={mergeClasses(
                    styles.system,
                    message.kind === 'join' && styles.joinText,
                    message.kind === 'leave' && styles.leaveText,
                    message.kind === 'server' && styles.serverText
                  )}
                >
                  {message.kind === 'server' ? `[Server] ${message.text}` : `${message.author} ${message.text}`}
                </Text>
              )}
            </div>
          ))
        )}
      </div>

      <div className={styles.inputRow}>
        <Input
          className={styles.grow}
          value={draft}
          disabled={!serverRunning}
          placeholder={serverRunning ? 'Broadcast a message to everyone…' : 'Server must be running'}
          onChange={(_, d) => setDraft(d.value)}
          onKeyDown={handleKeyDown}
        />
        <Button appearance="primary" icon={<Send20Regular />} disabled={!serverRunning} onClick={send}>
          Send
        </Button>
      </div>
    </div>
  )
}
