import { useEffect, useState, type JSX } from 'react'
import { makeStyles, tokens, Button, Text } from '@fluentui/react-components'
import { ArrowLeft24Regular, ArrowRight24Regular, Dismiss24Regular } from '@fluentui/react-icons'
import type { InstanceMetadata } from '@shared/types'
import { WizardStepper } from './WizardStepper'
import { buildSteps, createInitialWizardState, type WizardState } from './wizardState'
import { ServerTypeStep } from './steps/ServerTypeStep'
import { ModpackPickerStep } from './steps/ModpackPickerStep'
import { VersionStep } from './steps/VersionStep'
import { NameLocationStep } from './steps/NameLocationStep'
import { ResourcesStep } from './steps/ResourcesStep'
import { TogglesStep } from './steps/TogglesStep'
import { PluginsStep } from './steps/PluginsStep'
import { ReviewStep } from './steps/ReviewStep'
import { api } from '../../api'

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
    void api().settings.get().then((settings) => {
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

  // The step list changes with the chosen path, so navigation works off keys
  // rather than fixed indices.
  const steps = buildSteps(state)
  const boundedIndex = Math.min(stepIndex, steps.length - 1)
  const current = steps[boundedIndex]
  const isLastStep = boundedIndex === steps.length - 1

  const canGoNext =
    (current !== 'version' || state.minecraftVersion !== '') &&
    (current !== 'modpack' || state.modpack !== null) &&
    (current !== 'name' || state.name.trim() !== '')

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

      <WizardStepper steps={steps} currentStep={boundedIndex} />

      <div className={styles.body}>
        {current === 'type' && <ServerTypeStep state={state} onChange={onChange} />}
        {current === 'modpack' && <ModpackPickerStep state={state} onChange={onChange} />}
        {current === 'version' && <VersionStep state={state} onChange={onChange} />}
        {current === 'name' && <NameLocationStep state={state} onChange={onChange} />}
        {current === 'resources' && <ResourcesStep state={state} onChange={onChange} />}
        {current === 'toggles' && <TogglesStep state={state} onChange={onChange} />}
        {current === 'addons' && <PluginsStep state={state} onChange={onChange} />}
        {current === 'review' && <ReviewStep state={state} onCreated={onCreated} />}
      </div>

      <div className={styles.footer}>
        <Button
          appearance="subtle"
          icon={<ArrowLeft24Regular />}
          disabled={boundedIndex === 0}
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
            onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  )
}
