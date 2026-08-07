import { useState, type JSX } from 'react'
import { Button, Text, Tab, TabList, makeStyles, tokens } from '@fluentui/react-components'
import {
  Board24Regular,
  Globe24Regular,
  Server24Regular,
  Settings24Regular,
  Person24Regular
} from '@fluentui/react-icons'
import { AuthGate } from './AuthGate'
import { portalApi } from './api'
import { OverviewPage } from './pages/OverviewPage'
import { NodesPage } from './pages/NodesPage'
import { DomainsPage } from './pages/DomainsPage'
import { ClientsPage } from './pages/ClientsPage'
import { SettingsPage } from './pages/SettingsPage'

type Section = 'overview' | 'nodes' | 'domains' | 'clients' | 'settings'

const useStyles = makeStyles({
  shell: { height: '100%', display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '14px 24px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  brand: { display: 'flex', alignItems: 'baseline', gap: '10px' },
  brandName: { fontSize: '18px', fontWeight: 600 },
  brandTag: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  body: { flexGrow: 1, display: 'flex', minHeight: 0 },
  rail: {
    width: '212px',
    flexShrink: 0,
    padding: '16px 10px',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  content: { flexGrow: 1, minWidth: 0, overflow: 'auto' }
})

export function App(): JSX.Element {
  const styles = useStyles()
  const [section, setSection] = useState<Section>('overview')

  return (
    <AuthGate>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandName}>Chunkforge Portal</span>
            <span className={styles.brandTag}>subdomain manager &amp; proxy</span>
          </div>
          <Button
            appearance="subtle"
            onClick={() => void portalApi.auth.logout().then(() => location.reload())}
          >
            Sign out
          </Button>
        </header>

        <div className={styles.body}>
          <nav className={styles.rail}>
            <TabList
              vertical
              selectedValue={section}
              onTabSelect={(_, data) => setSection(data.value as Section)}
            >
              <Tab value="overview" icon={<Board24Regular />}>
                Overview
              </Tab>
              <Tab value="nodes" icon={<Server24Regular />}>
                Nodes
              </Tab>
              <Tab value="domains" icon={<Globe24Regular />}>
                Subdomains
              </Tab>
              <Tab value="clients" icon={<Person24Regular />}>
                Control planes
              </Tab>
              <Tab value="settings" icon={<Settings24Regular />}>
                Settings
              </Tab>
            </TabList>
            <Text
              size={200}
              block
              style={{ marginTop: '18px', padding: '0 10px', color: tokens.colorNeutralForeground4 }}
            >
              Servers themselves are managed from Chunkforge Desktop or Chunkforge Web, not here.
            </Text>
          </nav>

          <main className={styles.content}>
            {section === 'overview' && <OverviewPage />}
            {section === 'nodes' && <NodesPage />}
            {section === 'domains' && <DomainsPage />}
            {section === 'clients' && <ClientsPage />}
            {section === 'settings' && <SettingsPage />}
          </main>
        </div>
      </div>
    </AuthGate>
  )
}
