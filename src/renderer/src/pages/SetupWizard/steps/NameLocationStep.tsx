import type { JSX } from 'react'
import { makeStyles, tokens, Text, Title3, Field, Input, mergeClasses } from '@fluentui/react-components'
import { Checkmark16Filled } from '@fluentui/react-icons'
import { accentSwatches, type WizardState } from '../wizardState'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxWidth: '420px'
  },
  swatches: {
    display: 'flex',
    gap: '10px'
  },
  swatch: {
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusCircular,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    outlineOffset: '2px'
  },
  swatchSelected: {
    outline: `2px solid ${tokens.colorNeutralForeground1}`
  }
})

interface NameLocationStepProps {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}

export function NameLocationStep({ state, onChange }: NameLocationStepProps): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      <Title3>Name your server</Title3>
      <Field label="Server name" hint="Also used as the folder name under your Chunkforge Instances directory.">
        <Input
          value={state.name}
          placeholder="Survival SMP"
          onChange={(_, data) => onChange({ name: data.value })}
        />
      </Field>

      <Field label="Accent color">
        <div className={styles.swatches}>
          {accentSwatches.map((color) => {
            const selected = state.accentColor === color
            return (
              <button
                key={color}
                type="button"
                aria-label={color}
                className={mergeClasses(styles.swatch, selected && styles.swatchSelected)}
                style={{ backgroundColor: color }}
                onClick={() => onChange({ accentColor: color })}
              >
                {selected && <Checkmark16Filled />}
              </button>
            )
          })}
        </div>
      </Field>

      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        Files will live in Documents\Chunkforge\Instances\.
      </Text>
    </div>
  )
}
