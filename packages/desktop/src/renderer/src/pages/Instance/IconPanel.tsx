import { useEffect, useState, type JSX } from 'react'
import { makeStyles, tokens, Text, Button } from '@fluentui/react-components'
import { Image20Regular, Delete20Regular } from '@fluentui/react-icons'
import type { InstanceMetadata } from '@shared/types'
import { ServerThumbnail } from '../../components/ServerThumbnail'
import { isDesktopHost, native } from '../../native'

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
  row: { display: 'flex', alignItems: 'center', gap: '16px' },
  actions: { display: 'flex', gap: '8px' }
})

interface IconPanelProps {
  metadata: InstanceMetadata
  onChanged: () => void
}

export function IconPanel({ metadata, onChanged }: IconPanelProps): JSX.Element | null {
  const styles = useStyles()
  const [icon, setIcon] = useState<string | null>(null)
  // Choosing an icon needs a file dialog, which only the desktop shell has.
  // In a browser the whole panel is absent rather than present and throwing:
  // its three actions are all native, so there is nothing here that would work.
  const desktop = isDesktopHost()

  useEffect(() => {
    if (!desktop) return
    // A read that cannot happen yields nothing; it must not reject, or it
    // becomes an unhandled error every time a server is opened.
    native()
      .getIcon(metadata.id)
      .then(setIcon)
      .catch(() => setIcon(null))
  }, [metadata.id, desktop])

  if (!desktop) return null

  async function choose(): Promise<void> {
    const next = await native().pickIcon(metadata.id)
    if (next) {
      setIcon(next)
      onChanged()
    }
  }

  async function clear(): Promise<void> {
    await native().clearIcon(metadata.id)
    setIcon(null)
    onChanged()
  }

  return (
    <div className={styles.panel}>
      <Text weight="semibold" className={styles.title}>
        Server icon
      </Text>
      <Text size={200} className={styles.muted}>
        This writes <code>server-icon.png</code> in the server folder, so it shows in the in-game server
        list too. Images are resized to the 64×64 Minecraft requires.
      </Text>

      <div className={styles.row}>
        <ServerThumbnail
          name={metadata.name}
          serverType={metadata.serverType}
          iconUrl={icon}
          size={64}
        />
        <div className={styles.actions}>
          <Button icon={<Image20Regular />} onClick={choose}>
            {icon ? 'Change Icon…' : 'Choose Icon…'}
          </Button>
          {icon && (
            <Button appearance="subtle" icon={<Delete20Regular />} onClick={clear}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
