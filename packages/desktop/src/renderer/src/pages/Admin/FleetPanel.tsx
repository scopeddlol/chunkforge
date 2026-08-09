import { useCallback, useEffect, useState, type JSX } from 'react'
import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import { ArrowClockwise20Regular } from '@fluentui/react-icons'
import type { PortalInventory } from '@chunkforge/api/client'
import { api } from '../../api'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '14px' },
  plane: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2
  },
  planeHead: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  server: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 10px',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground1
  },
  grow: { flexGrow: 1, minWidth: 0 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }
})

/**
 * Every server on every control plane attached to this Portal.
 *
 * Read-only on purpose. Portal can see across panels because each one tells it
 * what it is running; it cannot drive them, and neither can this view. A panel
 * that is offline or has opted out is shown with its reason rather than left
 * out, since an omitted panel looks exactly like one with no servers.
 */
export function FleetPanel(): JSX.Element {
  const styles = useStyles()
  const [inventory, setInventory] = useState<PortalInventory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setInventory(await api().portal.inventory())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Portal.')
      setInventory(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading && !inventory) return <Spinner size="tiny" label="Asking Portal…" />

  if (error) {
    return (
      <div className={styles.root}>
        <MessageBar intent="warning">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
        <Text className={styles.muted}>
          This needs a linked Portal. Without one, a panel can only see its own servers — there is
          nothing else for it to ask.
        </Text>
      </div>
    )
  }

  // A panel with no Portal is not broken, it simply has nobody to ask.
  if (inventory && inventory.portalLinked === false) {
    return (
      <Text className={styles.muted}>
        This panel is not linked to a Portal, so there are no other control planes to see. Link one
        in Settings to gather every panel&apos;s servers into a single list here.
      </Text>
    )
  }

  const planes = inventory?.clients ?? []

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <Text className={styles.muted}>
          {inventory?.serverCount ?? 0} server{inventory?.serverCount === 1 ? '' : 's'} across{' '}
          {planes.length} control plane{planes.length === 1 ? '' : 's'}
          {inventory && inventory.unreachableCount > 0
            ? ` · ${inventory.unreachableCount} could not be asked`
            : ''}
        </Text>
        <Button size="small" icon={<ArrowClockwise20Regular />} onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {planes.length === 0 && (
        <Text className={styles.muted}>
          No other control planes are attached to this Portal yet.
        </Text>
      )}

      {planes.map((plane) => (
        <div key={plane.clientId} className={styles.plane}>
          <div className={styles.planeHead}>
            <Text weight="semibold">{plane.name}</Text>
            <Badge appearance="tint" color="informative">
              {plane.kind}
            </Badge>
            {plane.isSelf && (
              <Badge appearance="tint" color="brand">
                this panel
              </Badge>
            )}
            {!plane.connected && (
              <Badge appearance="tint" color="danger">
                offline
              </Badge>
            )}
          </div>

          {plane.problem && <Text className={styles.muted}>{plane.problem}</Text>}

          {plane.servers?.length === 0 && (
            <Text className={styles.muted}>No servers on this control plane.</Text>
          )}

          {plane.servers?.map((server) => (
            <div key={server.key} className={styles.server}>
              <div className={styles.grow}>
                <Text weight="semibold">{server.name}</Text>
                <Text block className={styles.muted}>
                  {[server.serverType, server.minecraftVersion].filter(Boolean).join(' ')}
                  {server.portalHostname ? ` · ${server.portalHostname}` : ''}
                </Text>
              </div>
              {typeof server.playersOnline === 'number' && server.playersOnline > 0 && (
                <Badge appearance="tint">{server.playersOnline} online</Badge>
              )}
              <Badge appearance="tint" color={server.status === 'running' ? 'success' : 'informative'}>
                {server.status ?? 'unknown'}
              </Badge>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
