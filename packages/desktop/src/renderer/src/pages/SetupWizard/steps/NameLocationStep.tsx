import { useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Title3,
  Field,
  Input,
  Button,
  Dropdown,
  Option,
  Text,
  mergeClasses
} from '@fluentui/react-components'
import { Checkmark16Filled, FolderOpen24Regular, ArrowResetRegular } from '@fluentui/react-icons'
import type { Node } from '@shared/types'
import { accentSwatches, type WizardState } from '../wizardState'
import { WizardPanel } from '../WizardPanel'
import { native } from '../../../native'
import { api } from '../../../api'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    maxWidth: '460px'
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
  },
  locationRow: {
    display: 'flex',
    gap: '8px'
  },
  locationInput: {
    flexGrow: 1
  },
  locationHint: {
    color: tokens.colorNeutralForeground3
  },
  resetLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '2px'
  }
})

interface NameLocationStepProps {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
}

export function NameLocationStep({ state, onChange }: NameLocationStepProps): JSX.Element {
  const styles = useStyles()
  const [defaultRoot, setDefaultRoot] = useState('')
  const [nodes, setNodes] = useState<Node[]>([])

  useEffect(() => {
    native().getDefaultInstancesRoot().then(setDefaultRoot)
  }, [])

  useEffect(() => {
    void api()
      .nodes.list()
      // Only nodes this Chunkforge has adopted can be deployed to, so offering
      // the rest would just be a list of ways to fail.
      .then((all) => setNodes(all.filter((node) => node.kind === 'local' || node.claimed)))
      .catch(() => setNodes([]))
  }, [])

  const remoteNodes = nodes.filter((node) => node.kind === 'portal')
  const isRemote = state.nodeId !== 'local'

  async function handleBrowse(): Promise<void> {
    const picked = await native().pickFolder('Choose where this server is created')
    if (picked) onChange({ installLocation: picked })
  }

  const displayedLocation = state.installLocation ?? defaultRoot

  return (
    <div className={styles.root}>
      <Title3>Name your server</Title3>

      <WizardPanel>
        <Field label="Server name" hint="Also used as the folder name on disk.">
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

        {remoteNodes.length > 0 && (
          <Field
            label="Run this server on"
            hint="Servers on a node get their own address automatically, and need no ports opened."
          >
            <Dropdown
              value={nodes.find((node) => node.id === state.nodeId)?.name ?? 'This machine'}
              selectedOptions={[state.nodeId]}
              onOptionSelect={(_, data) => onChange({ nodeId: data.optionValue ?? 'local' })}
            >
              {nodes.map((node) => (
                <Option key={node.id} value={node.id} text={node.name}>
                  {node.name}
                  {node.kind === 'portal' && node.status !== 'online' ? ' (offline)' : ''}
                </Option>
              ))}
            </Dropdown>
          </Field>
        )}

        {isRemote ? (
          <Text size={200} className={styles.locationHint}>
            This server is created on the node, in its own storage. Chunkforge will ask your Portal for
            an address once it exists.
          </Text>
        ) : (
          <Field label="Install location" hint="A folder named after your server is created here.">
            <div className={styles.locationRow}>
              <Input className={styles.locationInput} value={displayedLocation} readOnly />
              <Button icon={<FolderOpen24Regular />} onClick={handleBrowse}>
                Browse…
              </Button>
            </div>
            {state.installLocation && (
              <Button
                appearance="transparent"
                size="small"
                className={styles.resetLink}
                icon={<ArrowResetRegular />}
                onClick={() => onChange({ installLocation: null })}
              >
                Reset to default
              </Button>
            )}
          </Field>
        )}
      </WizardPanel>
    </div>
  )
}
