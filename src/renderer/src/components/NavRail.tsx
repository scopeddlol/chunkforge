import type { JSX } from 'react'
import { makeStyles, tokens, Tooltip, mergeClasses } from '@fluentui/react-components'
import {
  Grid24Regular,
  Grid24Filled,
  AppsAddIn24Regular,
  AppsAddIn24Filled,
  Settings24Regular,
  Settings24Filled,
  bundleIcon
} from '@fluentui/react-icons'

const DashboardIcon = bundleIcon(Grid24Filled, Grid24Regular)
const PluginsIcon = bundleIcon(AppsAddIn24Filled, AppsAddIn24Regular)
const SettingsIcon = bundleIcon(Settings24Filled, Settings24Regular)

export type NavKey = 'dashboard' | 'plugins' | 'settings'

const useStyles = makeStyles({
  root: {
    width: '64px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '16px',
    gap: '8px'
  },
  itemWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px'
  },
  indicator: {
    position: 'absolute',
    left: '-12px',
    width: '3px',
    height: '18px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    opacity: 0,
    transform: 'scaleY(0.4)',
    transitionProperty: 'opacity, transform',
    transitionDuration: tokens.durationNormal,
    transitionTimingFunction: tokens.curveEasyEase
  },
  indicatorActive: {
    opacity: 1,
    transform: 'scaleY(1)'
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: tokens.borderRadiusLarge,
    color: tokens.colorNeutralForeground2,
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
  }
})

const items: { key: NavKey; label: string; Icon: typeof DashboardIcon }[] = [
  { key: 'dashboard', label: 'Servers', Icon: DashboardIcon },
  { key: 'plugins', label: 'Plugins', Icon: PluginsIcon },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon }
]

interface NavRailProps {
  active: NavKey
  onSelect: (key: NavKey) => void
}

export function NavRail({ active, onSelect }: NavRailProps): JSX.Element {
  const styles = useStyles()

  return (
    <nav className={styles.root}>
      {items.map(({ key, label, Icon }) => {
        const isActive = active === key
        return (
          <Tooltip key={key} content={label} relationship="label" positioning="after">
            <div className={styles.itemWrap}>
              <span className={mergeClasses(styles.indicator, isActive && styles.indicatorActive)} />
              <button
                className={mergeClasses(styles.item, isActive && styles.itemActive)}
                onClick={() => onSelect(key)}
                aria-current={isActive}
                aria-label={label}
              >
                <Icon fontSize={22} />
              </button>
            </div>
          </Tooltip>
        )
      })}
    </nav>
  )
}
