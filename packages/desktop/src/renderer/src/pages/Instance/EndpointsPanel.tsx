import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { Delete16Regular } from '@fluentui/react-icons'
import type { EndpointProtocol } from '@shared/types'
import type { EndpointView } from '@chunkforge/api/client'
import { api } from '../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3
  },
  grow: { flexGrow: 1, minWidth: 0 },
  address: { fontFamily: tokens.fontFamilyMonospace, fontSize: '12px' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  form: { display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' },
  label: { minWidth: '160px' },
  port: { width: '110px' }
})

const PROTOCOL_LABELS: Record<EndpointProtocol, string> = {
  tcp: 'TCP',
  udp: 'UDP',
  http: 'HTTP'
}

interface EndpointsPanelProps {
  instanceId: string
}

/**
 * Every port a server listens on, and how the outside world reaches each one.
 *
 * A Minecraft server is rarely just a Minecraft server: voice chat wants UDP,
 * a live map wants a web port, and until now Chunkforge could only describe
 * one of them. Listing them together is the point — someone wondering "why
 * can nobody hear me" should be able to see whether the voice port was ever
 * published, without reading a mod's wiki to find out it needed one.
 */
export function EndpointsPanel({ instanceId }: EndpointsPanelProps): JSX.Element {
  const styles = useStyles()
  const [endpoints, setEndpoints] = useState<EndpointView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [protocol, setProtocol] = useState<EndpointProtocol>('tcp')
  const [port, setPort] = useState('')

  const reload = useCallback(async () => {
    try {
      setEndpoints(await api().endpoints.list(instanceId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this server’s endpoints.')
      setEndpoints([])
    }
  }, [instanceId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function add(): Promise<void> {
    if (!label.trim()) return
    setBusy(true)
    setError(null)
    try {
      // An empty port field means "pick one" — the machine that will listen is
      // the only one that can tell what is actually free.
      await api().endpoints.add(instanceId, {
        label: label.trim(),
        protocol,
        localPort: port.trim() ? Number(port) : undefined
      })
      setLabel('')
      setPort('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That endpoint could not be added.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(endpoint: EndpointView): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await api().endpoints.remove(instanceId, endpoint.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That endpoint could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  async function togglePublished(endpoint: EndpointView): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      if (endpoint.published) await api().endpoints.unpublish(instanceId, endpoint.id)
      else await api().endpoints.publish(instanceId, endpoint.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portal would not change that mapping.')
    } finally {
      setBusy(false)
    }
  }

  if (!endpoints) return <Spinner size="tiny" label="Loading endpoints…" />

  return (
    <div className={styles.root}>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {endpoints.map((endpoint) => (
        <div key={endpoint.id} className={styles.row}>
          <Badge appearance="tint" color={endpoint.protocol === 'http' ? 'brand' : 'informative'}>
            {PROTOCOL_LABELS[endpoint.protocol]}
          </Badge>
          <div className={styles.grow}>
            <Text weight="semibold">{endpoint.label}</Text>
            <div className={styles.muted}>{publicDescription(endpoint)}</div>
          </div>
          {/* The game port is derived from the server's own port and moves
              with it, so it is shown but never edited from here. */}
          {endpoint.source !== 'server' && (
            <>
              <Button size="small" disabled={busy} onClick={() => void togglePublished(endpoint)}>
                {endpoint.published ? 'Unpublish' : 'Publish'}
              </Button>
              <Button
                size="small"
                icon={<Delete16Regular />}
                disabled={busy}
                onClick={() => void remove(endpoint)}
                aria-label={`Remove ${endpoint.label}`}
              />
            </>
          )}
        </div>
      ))}

      <div className={styles.form}>
        <Field label="Name" className={styles.label}>
          <Input value={label} onChange={(_, d) => setLabel(d.value)} placeholder="Voice chat" />
        </Field>
        <Field label="Protocol">
          <Dropdown
            value={PROTOCOL_LABELS[protocol]}
            selectedOptions={[protocol]}
            onOptionSelect={(_, d) => setProtocol((d.optionValue as EndpointProtocol) ?? 'tcp')}
          >
            {(Object.keys(PROTOCOL_LABELS) as EndpointProtocol[]).map((value) => (
              <Option key={value} value={value}>
                {PROTOCOL_LABELS[value]}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="Port" hint="Leave empty to allocate one">
          <Input
            className={styles.port}
            value={port}
            type="number"
            onChange={(_, d) => setPort(d.value)}
          />
        </Field>
        <Button appearance="primary" disabled={busy || !label.trim()} onClick={() => void add()}>
          Add endpoint
        </Button>
      </div>
    </div>
  )
}

/** How this endpoint is reached, in the terms whoever connects would use. */
function publicDescription(endpoint: EndpointView): string {
  const local = `port ${endpoint.localPort} on the server`
  if (!endpoint.published) return `${local} — not published`
  if (endpoint.protocol === 'http' && endpoint.publicHostname) {
    return `https://${endpoint.publicHostname} → ${local}`
  }
  if (endpoint.publicPort) {
    return `public port ${endpoint.publicPort} → ${local}`
  }
  return local
}
