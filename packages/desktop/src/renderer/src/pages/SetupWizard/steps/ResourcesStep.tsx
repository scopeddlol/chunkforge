import type { JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Title3,
  Field,
  Slider,
  Input,
  Button
} from '@fluentui/react-components'
import type { WizardState } from '../wizardState'
import { WizardPanel } from '../WizardPanel'
import { usePortAvailability } from '../../../components/usePortAvailability'

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
  const availability = usePortAvailability(state.port, state.nodeId)

  // Three states, and the third matters: a node that cannot be reached has not
  // said the port is free, only that it could not answer. Reporting that as
  // available with no comment would be a promise nothing checked.
  const portState = availability.checking
    ? 'none'
    : availability.unknown
      ? 'warning'
      : availability.available
        ? 'success'
        : 'error'
  const portMessage = availability.checking ? undefined : (availability.reason ?? undefined)
  const portHint =
    availability.available && !availability.unknown && !availability.checking
      ? 'This port is free on the machine that will run the server.'
      : 'Default Minecraft port is 25565.'
  const suggestion = availability.suggestion ?? null

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

        <Field
          label="Server port"
          hint={portHint}
          validationState={portState}
          validationMessage={portMessage}
        >
          <Input
            type="number"
            value={String(state.port)}
            onChange={(_, data) => onChange({ port: Number(data.value) || 25565 })}
          />
        </Field>
        {suggestion !== null && (
          <Button size="small" onClick={() => onChange({ port: suggestion })}>
            Use {suggestion} instead
          </Button>
        )}
      </WizardPanel>
    </div>
  )
}
