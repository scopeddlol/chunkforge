import type { JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Title3,
  Field,
  Switch,
  Dropdown,
  Option,
  Slider
} from '@fluentui/react-components'
import { pluginServerTypes } from '@shared/types'
import type { WizardState } from '../wizardState'
import { WizardPanel } from '../WizardPanel'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    maxWidth: '460px'
  },
  switchRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  switchGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4px 16px'
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px'
  },
  sliderValue: {
    minWidth: '32px',
    textAlign: 'right',
    color: tokens.colorNeutralForeground2
  }
})

const difficulties: WizardState['toggles']['difficulty'][] = ['peaceful', 'easy', 'normal', 'hard']

interface TogglesStepProps {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}

export function TogglesStep({ state, onChange }: TogglesStepProps): JSX.Element {
  const styles = useStyles()
  const toggles = state.toggles
  // Geyser is a Bukkit-style plugin, so it only applies to plugin servers.
  const supportsGeyser = pluginServerTypes.includes(state.serverType)

  function patchToggles(patch: Partial<WizardState['toggles']>): void {
    onChange({ toggles: { ...toggles, ...patch } })
  }

  return (
    <div className={styles.root}>
      <Title3>Gameplay toggles</Title3>

      <WizardPanel>
        <div className={styles.switchGrid}>
          <Switch
            label="Online mode"
            checked={toggles.onlineMode}
            onChange={(_, data) => patchToggles({ onlineMode: data.checked })}
          />
          <Switch label="PvP" checked={toggles.pvp} onChange={(_, data) => patchToggles({ pvp: data.checked })} />
          <Switch
            label="Hardcore"
            checked={toggles.hardcore}
            onChange={(_, data) => patchToggles({ hardcore: data.checked })}
          />
          <Switch
            label="Whitelist"
            checked={toggles.whitelist}
            onChange={(_, data) => patchToggles({ whitelist: data.checked })}
          />
          <Switch
            label="Command blocks"
            checked={toggles.commandBlocksEnabled}
            onChange={(_, data) => patchToggles({ commandBlocksEnabled: data.checked })}
          />
        </div>

        {supportsGeyser && (
          <Field hint="Installs Geyser and Floodgate so Bedrock players — mobile, console, Windows 10/11 — can join this Java server.">
            <Switch
              label="Bedrock crossplay (Geyser)"
              checked={state.enableGeyser}
              onChange={(_, data) => onChange({ enableGeyser: data.checked })}
            />
          </Field>
        )}

        <Field label="Difficulty">
          <Dropdown
            value={toggles.difficulty}
            selectedOptions={[toggles.difficulty]}
            onOptionSelect={(_, data) => {
              if (data.optionValue) {
                patchToggles({ difficulty: data.optionValue as WizardState['toggles']['difficulty'] })
              }
            }}
          >
            {difficulties.map((d) => (
              <Option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </Option>
            ))}
          </Dropdown>
        </Field>

        <Field label="View distance (chunks)">
          <div className={styles.sliderRow}>
            <Slider
              min={3}
              max={32}
              value={toggles.viewDistance}
              onChange={(_, data) => patchToggles({ viewDistance: data.value })}
            />
            <Text className={styles.sliderValue}>{toggles.viewDistance}</Text>
          </div>
        </Field>

        <Field label="Spawn protection radius">
          <div className={styles.sliderRow}>
            <Slider
              min={0}
              max={32}
              value={toggles.spawnProtection}
              onChange={(_, data) => patchToggles({ spawnProtection: data.value })}
            />
            <Text className={styles.sliderValue}>{toggles.spawnProtection}</Text>
          </div>
        </Field>
      </WizardPanel>
    </div>
  )
}
