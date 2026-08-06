import type { JSX } from 'react'
import { makeStyles, tokens, Text, Title2, Button } from '@fluentui/react-components'
import { AddCircle24Regular } from '@fluentui/react-icons'
import { ChunkforgeMark } from '../../components/ChunkforgeMark'

const useStyles = makeStyles({
  root: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '28px 36px',
    overflow: 'auto'
  },
  header: {
    marginBottom: '32px'
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    marginTop: '4px'
  },
  emptyState: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '18px',
    textAlign: 'center',
    padding: '48px',
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`
  },
  markBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '84px',
    height: '84px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground2,
    marginBottom: '4px'
  },
  emptyBody: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '360px',
    lineHeight: '20px'
  }
})

export function DashboardPage(): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title2>Your Servers</Title2>
        <Text className={styles.subtitle} block>
          Forge Your World.
        </Text>
      </div>

      <div className={styles.emptyState}>
        <div className={styles.markBadge}>
          <ChunkforgeMark size={40} />
        </div>
        <Title2>No servers yet</Title2>
        <Text className={styles.emptyBody}>
          Spin up a Vanilla, Paper, Purpur, Spigot, Forge, or Fabric server in a few clicks — pick
          a version, tune your settings, and add plugins before the first boot.
        </Text>
        <Button appearance="primary" icon={<AddCircle24Regular />} size="large">
          Create Your First Server
        </Button>
      </div>
    </div>
  )
}
