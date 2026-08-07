import type { JSX } from 'react'
import { makeStyles, tokens, Text, mergeClasses } from '@fluentui/react-components'
import { Checkmark16Filled } from '@fluentui/react-icons'
import type { ThemePreference } from '@shared/types'
import { chunkforgeThemes } from '../../theme/chunkforgeTheme'

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '10px'
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    textAlign: 'left',
    transitionProperty: 'border-color',
    transitionDuration: tokens.durationFaster,
    ':hover': { border: `1px solid ${tokens.colorNeutralStroke1}` }
  },
  cardActive: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2
  },
  // A miniature of the app itself reads far better than a flat colour chip.
  swatch: {
    height: '58px',
    borderRadius: tokens.borderRadiusSmall,
    overflow: 'hidden',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex'
  },
  swatchRail: {
    width: '14px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '5px',
    gap: '4px'
  },
  railDot: { width: '6px', height: '6px', borderRadius: '2px' },
  swatchBody: { flexGrow: 1, padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' },
  swatchCard: { borderRadius: '3px', padding: '4px', display: 'flex', flexDirection: 'column', gap: '3px' },
  swatchLine: { height: '3px', borderRadius: '2px' },
  swatchButton: { height: '7px', width: '30%', borderRadius: '2px' },
  labelRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  desc: { color: tokens.colorNeutralForeground3, fontSize: '11px', lineHeight: '14px' }
})

interface ThemePickerProps {
  value: ThemePreference
  onChange: (value: ThemePreference) => void
}

export function ThemePicker({ value, onChange }: ThemePickerProps): JSX.Element {
  const styles = useStyles()

  const options: Array<{
    id: ThemePreference
    label: string
    description: string
    preview: [string, string]
    surface: string
    muted: string
  }> = [
    {
      id: 'system',
      label: 'Match Windows',
      description: 'Follows your system light/dark setting.',
      preview: ['#8B5CF6', '#000000'],
      surface: '#0C0A11',
      muted: '#4A4358'
    },
    ...chunkforgeThemes.map((t) => ({
      id: t.id as ThemePreference,
      label: t.label,
      description: t.description,
      preview: t.preview,
      surface: t.theme.colorNeutralBackground1,
      muted: t.isDark ? t.popupBorder : t.theme.colorNeutralStroke1
    }))
  ]

  return (
    <div className={styles.grid}>
      {options.map((option) => {
        const active = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            className={mergeClasses(styles.card, active && styles.cardActive)}
            onClick={() => onChange(option.id)}
            aria-pressed={active}
          >
            <div className={styles.swatch} style={{ backgroundColor: option.preview[1] }}>
              <div className={styles.swatchRail} style={{ backgroundColor: option.surface }}>
                <span className={styles.railDot} style={{ backgroundColor: option.preview[0] }} />
                <span className={styles.railDot} style={{ backgroundColor: option.muted }} />
                <span className={styles.railDot} style={{ backgroundColor: option.muted }} />
              </div>
              <div className={styles.swatchBody}>
                <div className={styles.swatchCard} style={{ backgroundColor: option.surface }}>
                  <span className={styles.swatchLine} style={{ backgroundColor: option.muted, width: '70%' }} />
                  <span className={styles.swatchLine} style={{ backgroundColor: option.muted, width: '45%' }} />
                </div>
                <span className={styles.swatchButton} style={{ backgroundColor: option.preview[0] }} />
              </div>
            </div>
            <div className={styles.labelRow}>
              {active && <Checkmark16Filled />}
              <Text weight={active ? 'semibold' : 'regular'} size={200}>
                {option.label}
              </Text>
            </div>
            <Text className={styles.desc}>{option.description}</Text>
          </button>
        )
      })}
    </div>
  )
}
