import type { JSX } from 'react'
import { makeStyles, tokens, Text, Title3, Field, Slider, Input } from '@fluentui/react-components'
import type { WizardState } from '../wizardState'
import { WizardPanel } from '../WizardPanel'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    maxWidth: '460px'
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px'
  },
  sliderValue: {
    minWidth: '64px',
    textAlign: 'right',
    color: tokens.colorNeutralForeground2
  }
})

interface ResourcesStepProps {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}

export function ResourcesStep({ state, onChange }: ResourcesStepProps): JSX.Element {
  const styles = useStyles()

  return (
    <div className={styles.root}>
      <Title3>Resources &amp; network</Title3>

      <WizardPanel>
        <Field label="Minimum RAM">
          <div className={styles.sliderRow}>
            <Slider
              min={512}
              max={state.maxRamMb}
              step={512}
              value={state.minRamMb}
              onChange={(_, data) => onChange({ minRamMb: data.value })}
            />
            <Text className={styles.sliderValue}>{(state.minRamMb / 1024).toFixed(1)} GB</Text>
          </div>
        </Field>

        <Field label="Maximum RAM">
          <div className={styles.sliderRow}>
            <Slider
              min={state.minRamMb}
              max={16384}
              step={512}
              value={state.maxRamMb}
              onChange={(_, data) => onChange({ maxRamMb: data.value })}
            />
            <Text className={styles.sliderValue}>{(state.maxRamMb / 1024).toFixed(1)} GB</Text>
          </div>
        </Field>

        <Field label="Server port" hint="Default Minecraft port is 25565.">
          <Input
            type="number"
            value={String(state.port)}
            onChange={(_, data) => onChange({ port: Number(data.value) || 25565 })}
          />
        </Field>
      </WizardPanel>
    </div>
  )
}
