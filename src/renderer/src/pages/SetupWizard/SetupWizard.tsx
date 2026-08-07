import { useEffect, useState, type JSX } from 'react'
import { makeStyles, tokens, Button, Text } from '@fluentui/react-components'
import { ArrowLeft24Regular, ArrowRight24Regular, Dismiss24Regular } from '@fluentui/react-icons'
import type { InstanceMetadata } from '@shared/types'
import { WizardStepper } from './WizardStepper'
import { createInitialWizardState, wizardSteps, type WizardState } from './wizardState'
import { ServerTypeStep } from './steps/ServerTypeStep'
import { VersionStep } from './steps/VersionStep'
import { NameLocationStep } from './steps/NameLocationStep'
import { ResourcesStep } from './steps/ResourcesStep'
import { TogglesStep } from './steps/TogglesStep'
import { PluginsStep } from './steps/PluginsStep'
import { ReviewStep } from './steps/ReviewStep'

const useStyles = makeStyles({
  root: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 36px 0'
  },
  body: {
    flexGrow: 1,
    overflow: 'auto',
    padding: '28px 36px'
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px 36px',
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`
  }
})

interface SetupWizardProps {
  onClose: () => void
  onCreated: (metadata: InstanceMetadata) => void
}

export function SetupWizard({ onClose, onCreated }: SetupWizardProps): JSX.Element {
  const styles = useStyles()
  const [stepIndex, setStepIndex] = useState(0)
  const [state, setState] = useState<WizardState>(() => createInitialWizardState())

  // Seed from the saved "new server defaults" without blocking first paint.
  useEffect(() => {
    let cancelled = false
    window.chunkforge.settings.get().then((settings) => {
      if (cancelled) return
      setState((prev) => ({
        ...prev,
        port: settings.defaultPort,
        minRamMb: settings.defaultMinRamMb,
        maxRamMb: settings.defaultMaxRamMb,
        installLocation: settings.defaultInstallLocation
      }))
    })
    return () => {
      cancelled = true
    }
  }, [])

  function onChange(patch: Partial<WizardState>): void {
    setState((prev) => ({ ...prev, ...patch }))
  }

  const isLastStep = stepIndex === wizardSteps.length - 1
  const canGoNext =
    (stepIndex !== 1 || state.minecraftVersion !== '') && (stepIndex !== 2 || state.name.trim() !== '')

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text weight="semibold" size={400}>
          New Server
        </Text>
        <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose}>
          Cancel
        </Button>
      </div>

      <WizardStepper currentStep={stepIndex} />

      <div className={styles.body}>
        {stepIndex === 0 && <ServerTypeStep state={state} onChange={onChange} />}
        {stepIndex === 1 && <VersionStep state={state} onChange={onChange} />}
        {stepIndex === 2 && <NameLocationStep state={state} onChange={onChange} />}
        {stepIndex === 3 && <ResourcesStep state={state} onChange={onChange} />}
        {stepIndex === 4 && <TogglesStep state={state} onChange={onChange} />}
        {stepIndex === 5 && <PluginsStep />}
        {stepIndex === 6 && <ReviewStep state={state} onCreated={onCreated} />}
      </div>

      <div className={styles.footer}>
        <Button
          appearance="subtle"
          icon={<ArrowLeft24Regular />}
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
        >
          Back
        </Button>
        {!isLastStep && (
          <Button
            appearance="primary"
            iconPosition="after"
            icon={<ArrowRight24Regular />}
            disabled={!canGoNext}
            onClick={() => setStepIndex((i) => Math.min(wizardSteps.length - 1, i + 1))}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
