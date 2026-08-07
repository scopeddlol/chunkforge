import { useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Field,
  Input,
  Slider,
  Switch,
  Dropdown,
  Option,
  Divider,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox
} from '@fluentui/react-components'
import { FolderOpen20Regular, Save20Regular, Delete20Regular } from '@fluentui/react-icons'
import type { InstanceMetadata, InstanceToggles } from '@shared/types'
import { IconPanel } from './IconPanel'
import { StartupPanel } from './StartupPanel'

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '18px', overflowY: 'auto', paddingBottom: '20px' },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    maxWidth: '560px'
  },
  sectionTitle: { color: tokens.colorNeutralForeground2 },
  sliderRow: { display: 'flex', alignItems: 'center', gap: '14px' },
  sliderValue: { minWidth: '64px', textAlign: 'right', color: tokens.colorNeutralForeground2 },
  switchGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' },
  actions: { display: 'flex', gap: '8px' },
  pathText: { color: tokens.colorNeutralForeground3, wordBreak: 'break-all' },
  danger: { border: `1px solid ${tokens.colorPaletteRedBorder1}` }
})

const difficulties: InstanceToggles['difficulty'][] = ['peaceful', 'easy', 'normal', 'hard']

interface InstanceSettingsTabProps {
  metadata: InstanceMetadata
  onSaved: (updated: InstanceMetadata) => void
  onDeleted: () => void
}

export function InstanceSettingsTab({ metadata, onSaved, onDeleted }: InstanceSettingsTabProps): JSX.Element {
  const styles = useStyles()
  const [draft, setDraft] = useState<InstanceMetadata>(metadata)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(true)

  const dirty = JSON.stringify(draft) !== JSON.stringify(metadata)

  function patch(next: Partial<InstanceMetadata>): void {
    setDraft((prev) => ({ ...prev, ...next }))
  }

  function patchToggles(next: Partial<InstanceToggles>): void {
    setDraft((prev) => ({ ...prev, toggles: { ...prev.toggles, ...next } }))
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const updated = await window.chunkforge.servers.updateSettings(metadata.id, {
        name: draft.name,
        port: draft.port,
        minRamMb: draft.minRamMb,
        maxRamMb: draft.maxRamMb,
        accentColor: draft.accentColor,
        toggles: draft.toggles
      })
      setDraft(updated)
      onSaved(updated)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        <Text weight="semibold" className={styles.sectionTitle}>
          General
        </Text>
        <Field label="Server name">
          <Input value={draft.name} onChange={(_, d) => patch({ name: d.value })} />
        </Field>
        <Field label="Port">
          <Input
            type="number"
            value={String(draft.port)}
            onChange={(_, d) => patch({ port: Number(d.value) || draft.port })}
          />
        </Field>

        <Divider />
        <Text weight="semibold" className={styles.sectionTitle}>
          Memory
        </Text>
        <Field label="Minimum RAM">
          <div className={styles.sliderRow}>
            <Slider
              min={512}
              max={draft.maxRamMb}
              step={512}
              value={draft.minRamMb}
              onChange={(_, d) => patch({ minRamMb: d.value })}
            />
            <Text className={styles.sliderValue}>{(draft.minRamMb / 1024).toFixed(1)} GB</Text>
          </div>
        </Field>
        <Field label="Maximum RAM">
          <div className={styles.sliderRow}>
            <Slider
              min={draft.minRamMb}
              max={16384}
              step={512}
              value={draft.maxRamMb}
              onChange={(_, d) => patch({ maxRamMb: d.value })}
            />
            <Text className={styles.sliderValue}>{(draft.maxRamMb / 1024).toFixed(1)} GB</Text>
          </div>
        </Field>

        <Divider />
        <Text weight="semibold" className={styles.sectionTitle}>
          Gameplay
        </Text>
        <div className={styles.switchGrid}>
          <Switch
            label="Online mode"
            checked={draft.toggles.onlineMode}
            onChange={(_, d) => patchToggles({ onlineMode: d.checked })}
          />
          <Switch label="PvP" checked={draft.toggles.pvp} onChange={(_, d) => patchToggles({ pvp: d.checked })} />
          <Switch
            label="Hardcore"
            checked={draft.toggles.hardcore}
            onChange={(_, d) => patchToggles({ hardcore: d.checked })}
          />
          <Switch
            label="Whitelist"
            checked={draft.toggles.whitelist}
            onChange={(_, d) => patchToggles({ whitelist: d.checked })}
          />
          <Switch
            label="Command blocks"
            checked={draft.toggles.commandBlocksEnabled}
            onChange={(_, d) => patchToggles({ commandBlocksEnabled: d.checked })}
          />
        </div>
        <Field label="Difficulty">
          <Dropdown
            value={draft.toggles.difficulty}
            selectedOptions={[draft.toggles.difficulty]}
            onOptionSelect={(_, d) =>
              d.optionValue && patchToggles({ difficulty: d.optionValue as InstanceToggles['difficulty'] })
            }
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
              value={draft.toggles.viewDistance}
              onChange={(_, d) => patchToggles({ viewDistance: d.value })}
            />
            <Text className={styles.sliderValue}>{draft.toggles.viewDistance}</Text>
          </div>
        </Field>

        <div className={styles.actions}>
          <Button appearance="primary" icon={<Save20Regular />} disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
          <Button disabled={!dirty} onClick={() => setDraft(metadata)}>
            Reset
          </Button>
        </div>
      </div>

      <IconPanel metadata={metadata} onChanged={() => onSaved(metadata)} />

      <StartupPanel metadata={metadata} onSaved={onSaved} />

      <div className={styles.panel}>
        <Text weight="semibold" className={styles.sectionTitle}>
          Files &amp; runtime
        </Text>
        <Field label="Server folder">
          <Text size={200} className={styles.pathText}>
            {metadata.path}
          </Text>
        </Field>
        <Field label="Java runtime">
          <Text size={200} className={styles.pathText}>
            {metadata.javaPath ?? 'Not resolved'}
            {metadata.javaMajor ? ` (Java ${metadata.javaMajor})` : ''}
          </Text>
        </Field>
        <div className={styles.actions}>
          <Button
            icon={<FolderOpen20Regular />}
            onClick={() => window.chunkforge.servers.openFolder(metadata.id)}
          >
            Open Folder
          </Button>
        </div>
      </div>

      <div className={`${styles.panel} ${styles.danger}`}>
        <Text weight="semibold" className={styles.sectionTitle}>
          Danger zone
        </Text>
        <Text size={200} className={styles.pathText}>
          Deleting removes this server from Chunkforge, and optionally erases its world and files.
        </Text>
        <div className={styles.actions}>
          <Button appearance="secondary" icon={<Delete20Regular />} onClick={() => setConfirmDelete(true)}>
            Delete Server
          </Button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={(_, d) => setConfirmDelete(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete “{metadata.name}”?</DialogTitle>
            <DialogContent>
              <Text block>This stops the server and removes it from Chunkforge.</Text>
              <br />
              <Checkbox
                checked={deleteFiles}
                onChange={(_, d) => setDeleteFiles(Boolean(d.checked))}
                label="Also permanently delete the server folder, world, and all files"
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                appearance="primary"
                onClick={async () => {
                  await window.chunkforge.servers.delete(metadata.id, deleteFiles)
                  setConfirmDelete(false)
                  onDeleted()
                }}
              >
                Delete
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
