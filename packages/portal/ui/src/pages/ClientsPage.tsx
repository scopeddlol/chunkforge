import { useEffect, useState, type JSX } from 'react'
import { Badge, Button, Spinner, Text, Title2, makeStyles, tokens } from '@fluentui/react-components'
import { portalApi } from '../api'
import { PinPanel } from './PinPanel'
import type { PortalClientRecord } from '../../../src/types'

const useStyles = makeStyles({
  root: { padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: '20px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  muted: { color: tokens.colorNeutralForeground3 },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    flexWrap: 'wrap'
  },
  spacer: { flexGrow: 1 },
  empty: {
    padding: '22px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  }
})

/**
 * "Control plane" is the Chunkforge UI that manages servers — Desktop on a PC,
 * or Web in a homelab. Portal tracks them so it knows who may claim which node
 * and who owns which subdomain.
 */
export function ClientsPage(): JSX.Element {
  const styles = useStyles()
  const [clients, setClients] = useState<Omit<PortalClientRecord, 'tokenHash'>[] | null>(null)

  async function refresh(): Promise<void> {
    setClients(await portalApi.clients.list())
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className={styles.root}>
      <div>
        <Title2>Control planes</Title2>
        <Text className={styles.subtitle} block>
          The Chunkforge interfaces attached to this Portal. They create the servers; Portal gives them
          names and a way to reach their nodes.
        </Text>
      </div>

      <PinPanel
        kind="client"
        title="Control plane pins"
        description="Enter one of these in Chunkforge Desktop or Chunkforge Web under Settings → Chunkforge Portal."
        placeholder="Desktop — my PC"
      />

      {!clients && <Spinner label="Loading…" />}

      {clients && clients.length === 0 && (
        <div className={styles.empty}>
          <Text weight="semibold" block>
            Nothing attached yet
          </Text>
          <Text block className={styles.muted}>
            Generate a pin above and redeem it from your Chunkforge UI.
          </Text>
        </div>
      )}

      {clients && clients.length > 0 && (
        <div className={styles.list}>
          {clients.map((client) => (
            <div key={client.id} className={styles.row}>
              <Text weight="semibold">{client.name}</Text>
              <Badge appearance="tint">{client.kind}</Badge>
              <span className={styles.spacer} />
              <Text size={200} className={styles.muted}>
                {client.lastSeenAt
                  ? `seen ${new Date(client.lastSeenAt).toLocaleString()}`
                  : `paired ${new Date(client.pairedAt).toLocaleDateString()}`}
              </Text>
              <Button
                size="small"
                appearance="subtle"
                onClick={() => void portalApi.clients.remove(client.id).then(refresh)}
              >
                Detach
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
