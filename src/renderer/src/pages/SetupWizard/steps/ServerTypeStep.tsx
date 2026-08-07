import type { JSX } from 'react'
import { makeStyles, tokens, Text, Title3, Badge, mergeClasses } from '@fluentui/react-components'
import type { ServerType } from '@shared/types'
import type { WizardState } from '../wizardState'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px'
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    // Native buttons ignore inherited color and fall back to the UA `buttontext`
    // (black, and near-transparent black when disabled), so set it explicitly.
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    textAlign: 'left',
    transitionProperty: 'border-color, background-color',
    transitionDuration: tokens.durationFaster,
    ':hover': {
      border: `1px solid ${tokens.colorNeutralStroke1}`
    }
  },
  cardSelected: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2
  },
  cardDisabled: {
    cursor: 'not-allowed',
    color: tokens.colorNeutralForegroundDisabled,
    backgroundColor: tokens.colorNeutralBackground2,
    ':hover': {
      border: `1px solid ${tokens.colorNeutralStroke2}`
    }
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  blurb: {
    color: tokens.colorNeutralForeground3
  }
})

const options: { type: ServerType; label: string; blurb: string; note?: string }[] = [
  { type: 'paper', label: 'Paper', blurb: 'High-performance, plugin-friendly. Recommended default.' },
  { type: 'vanilla', label: 'Vanilla', blurb: "Mojang's unmodified server." },
  { type: 'purpur', label: 'Purpur', blurb: 'Paper fork with extra gameplay knobs.' },
  { type: 'fabric', label: 'Fabric', blurb: 'Lightweight, fast-updating mod loader.' },
  { type: 'forge', label: 'Forge', blurb: 'The original Minecraft modding platform.', note: 'Runs installer' },
  {
    type: 'spigot',
    label: 'Spigot',
    blurb: "Classic plugin server. Can't be redistributed, so it compiles locally.",
    note: 'Slow build'
  }
]

interface ServerTypeStepProps {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}

export function ServerTypeStep({ state, onChange }: ServerTypeStepProps): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      <Title3>What kind of server?</Title3>
      <div className={styles.grid}>
        {options.map((option) => {
          const selected = state.serverType === option.type
          return (
            <button
              key={option.type}
              type="button"
              className={mergeClasses(styles.card, selected && styles.cardSelected)}
              onClick={() => onChange({ serverType: option.type, minecraftVersion: '' })}
            >
              <div className={styles.cardHeader}>
                <Text weight="semibold">{option.label}</Text>
                {option.note && (
                  <Badge appearance="tint" color="warning">
                    {option.note}
                  </Badge>
                )}
              </div>
              <Text size={200} className={styles.blurb}>
                {option.blurb}
              </Text>
            </button>
          )
        })}
      </div>
    </div>
  )
}
