import type { JSX } from 'react'
import { makeStyles, tokens, Text, mergeClasses } from '@fluentui/react-components'
import {
  Grid24Regular,
  Grid24Filled,
  AppsAddIn24Regular,
  AppsAddIn24Filled,
  Settings24Regular,
  Settings24Filled,
  Box24Regular,
  Box24Filled,
  Layer24Regular,
  Layer24Filled,
  bundleIcon
} from '@fluentui/react-icons'

const DashboardIcon = bundleIcon(Grid24Filled, Grid24Regular)
const PluginsIcon = bundleIcon(AppsAddIn24Filled, AppsAddIn24Regular)
const ModsIcon = bundleIcon(Box24Filled, Box24Regular)
const ModpackIcon = bundleIcon(Layer24Filled, Layer24Regular)
const SettingsIcon = bundleIcon(Settings24Filled, Settings24Regular)

export type NavKey = 'dashboard' | 'plugins' | 'mods' | 'modpacks' | 'settings'

const useStyles = makeStyles({
  root: {
    width: '88px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '14px',
    gap: '6px',
    borderRight: `1px solid ${tokens.colorNeutralStroke3}`
  },
  item: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    width: '72px',
    padding: '10px 4px 8px',
    borderRadius: tokens.borderRadiusLarge,
    color: tokens.colorNeutralForeground3,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      backgroundColor: tokens.colorSubtleBackgroundHover,
      color: tokens.colorNeutralForeground1
    },
    ':active': {
      backgroundColor: tokens.colorSubtleBackgroundPressed
    }
  },
  itemActive: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
      color: tokens.colorBrandForeground1
    }
  },
  indicator: {
    position: 'absolute',
    left: '-8px',
    top: '50%',
    marginTop: '-9px',
    width: '3px',
    height: '18px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground
  },
  label: {
    fontSize: '11px',
    lineHeight: '14px'
  }
})

const items: { key: NavKey; label: string; Icon: typeof DashboardIcon }[] = [
  { key: 'dashboard', label: 'Servers', Icon: DashboardIcon },
  { key: 'plugins', label: 'Plugins', Icon: PluginsIcon },
  { key: 'mods', label: 'Mods', Icon: ModsIcon },
  { key: 'modpacks', label: 'Modpacks', Icon: ModpackIcon },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon }
]

interface NavRailProps {
  active: NavKey
  onSelect: (key: NavKey) => void
}

/**
 * Labels are rendered inline rather than in hover tooltips: a Fluent Tooltip
 * mounts a portal on every hover, and popup layers in this window trigger a
 * full-window repaint flash.
 */
export function NavRail({ active, onSelect }: NavRailProps): JSX.Element {
  const styles = useStyles()

  return (
    <nav className={styles.root}>
      {items.map(({ key, label, Icon }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            className={mergeClasses(styles.item, isActive && styles.itemActive)}
            onClick={() => onSelect(key)}
            aria-current={isActive}
          >
            {isActive && <span className={styles.indicator} />}
            <Icon fontSize={22} />
            <Text className={styles.label}>{label}</Text>
          </button>
        )
      })}
    </nav>
  )
}
