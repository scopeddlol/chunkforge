import type { JSX } from 'react'
import { makeStyles, tokens, Text, Button } from '@fluentui/react-components'
import { ArrowDownload20Regular, Open16Regular, AppsAddIn24Regular } from '@fluentui/react-icons'
import type { PluginSearchResult } from '@shared/types'
import { SourceBadge } from '../../components/SourceBadge'
import { native } from '../../native'

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    transitionProperty: 'border-color, transform',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      border: `1px solid ${tokens.colorBrandStroke1}`
    }
  },
  head: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start'
  },
  icon: {
    width: '44px',
    height: '44px',
    borderRadius: tokens.borderRadiusMedium,
    objectFit: 'cover',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground3
  },
  iconFallback: {
    width: '44px',
    height: '44px',
    borderRadius: tokens.borderRadiusMedium,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
    flexGrow: 1
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'space-between'
  },
  badges: { display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  author: {
    color: tokens.colorNeutralForeground3
  },
  summary: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    lineHeight: '18px',
    minHeight: '36px'
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto'
  },
  downloads: {
    color: tokens.colorNeutralForeground3
  },
  actions: {
    display: 'flex',
    gap: '4px'
  }
})

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return String(count)
}

interface PluginCardProps {
  plugin: PluginSearchResult
  onInstall: (plugin: PluginSearchResult) => void
  canInstall: boolean
}

export function PluginCard({ plugin, onInstall, canInstall }: PluginCardProps): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        {plugin.iconUrl ? (
          <img className={styles.icon} src={plugin.iconUrl} alt="" loading="lazy" />
        ) : (
          <div className={styles.iconFallback}>
            <AppsAddIn24Regular />
          </div>
        )}
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <Text weight="semibold" className={styles.name}>
              {plugin.name}
            </Text>
            <div className={styles.badges}>
              <SourceBadge source={plugin.source} />
              {/* The same project often exists on several sources; the extra
                  badges show where else it can be pulled from. */}
              {plugin.alternatives?.map((alt) => (
                <SourceBadge key={alt.source} source={alt.source} />
              ))}
            </div>
          </div>
          <Text size={200} className={styles.author}>
            by {plugin.author}
          </Text>
        </div>
      </div>

      <Text size={200} className={styles.summary}>
        {plugin.summary}
      </Text>

      <div className={styles.footer}>
        <Text size={200} className={styles.downloads}>
          {formatDownloads(plugin.downloads)} downloads
        </Text>
        <div className={styles.actions}>
          <Button
            appearance="subtle"
            size="small"
            icon={<Open16Regular />}
            title="Open source page"
            onClick={() => native().openExternal(plugin.sourceUrl)}
          />
          <Button
            appearance="primary"
            size="small"
            icon={<ArrowDownload20Regular />}
            disabled={!canInstall}
            title={canInstall ? 'Install to server' : 'Select a server first'}
            onClick={() => onInstall(plugin)}
          >
            Install
          </Button>
        </div>
      </div>
    </div>
  )
}
