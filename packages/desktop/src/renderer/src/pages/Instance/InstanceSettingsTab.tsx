import { useEffect, useState, type JSX } from 'react'
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
import { CopyableAddress } from '../../components/CopyableAddress'
import { resolveServerAddress } from '../../components/serverAddress'
import { api } from '../../api'
import { native } from '../../native'

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
  danger: { border: `1px solid ${tokens.colorPaletteRedBorder1}` },
  portalHost: {
    padding: '10px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    fontFamily: 'Consolas, monospace'
  }
})

const difficulties: InstanceToggles['difficulty'][] = ['peaceful', 'easy', 'normal', 'hard']

/** The label part of a hostname, e.g. `survival` from `survival.play.example.com`. */
function labelFromHostname(hostname: string | null | undefined): string {
  return hostname?.split('.')[0] ?? ''
}

interface InstanceSettingsTabProps {
  metadata: InstanceMetadata
  onSaved: (updated: InstanceMetadata) => void
  onDeleted: () => void
}

export function InstanceSettingsTab({ metadata, onSaved, onDeleted }: InstanceSettingsTabProps): JSX.Element {
  const styles = useStyles()
  const [draft, setDraft] = useState<InstanceMetadata>(metadata)
  const [saving, setSaving] = useState(false)
  const [hostError, setHostError] = useState<string | null>(null)
  const [subdomainLabel, setSubdomainLabel] = useState(labelFromHostname(metadata.portalHostname))
  const [renamingHost, setRenamingHost] = useState(false)
  const [portalLinked, setPortalLinked] = useState(Boolean(metadata.portalHostname))
  const [zoneSuffix, setZoneSuffix] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(true)

  const dirty = JSON.stringify(draft) !== JSON.stringify(metadata)

  // Whether a subdomain can be set at all is a property of the Portal link,
  // not of this server — a node server that has never been allocated one still
  // needs the field, which is exactly the case the old button handled badly.
  useEffect(() => {
    let cancelled = false
    api()
      .portal.status()
      .then((status) => {
        if (cancelled) return
        setPortalLinked(Boolean(status.enabled && status.clientToken))
        setZoneSuffix(status.zoneSuffix ?? '')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  function patch(next: Partial<InstanceMetadata>): void {
    setDraft((prev) => ({ ...prev, ...next }))
  }

  function patchToggles(next: Partial<InstanceToggles>): void {
    setDraft((prev) => ({ ...prev, toggles: { ...prev.toggles, ...next } }))
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const updated = await api().servers.update(metadata.id, {
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

  /**
   * Applies whatever is in the subdomain box.
   *
   * One control for both cases on purpose: a server with an address is
   * renamed, keeping the public port so nobody who already saved the old
   * address loses their connection, and a server without one is allocated the
   * label as its first address. Which of those two calls is needed is a detail
   * of Portal's API, not a decision worth making the user understand — the
   * previous "Allocate Address" button exposed exactly that split, and did
   * nothing at all for the far more common case of wanting a different name.
   */
  async function applySubdomain(): Promise<void> {
    const label = subdomainLabel.trim()
    if (!label) return
    setRenamingHost(true)
    setHostError(null)
    try {
      const domain = draft.portalHostname
        ? await api().portal.renameDomain(metadata.id, label)
        : await api().portal.provisionDomain(metadata.id, true, label)
      const updated = { ...draft, portalHostname: domain.hostname, portalPublicPort: domain.publicPort }
      setDraft(updated)
      setSubdomainLabel(labelFromHostname(domain.hostname))
      onSaved(updated)
    } catch (err) {
      setHostError(err instanceof Error ? err.message : 'Could not update that address.')
    } finally {
      setRenamingHost(false)
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
        <Field
          label="Public address"
          hint="Allocated by your Portal. Servers on a node get one automatically."
          validationMessage={hostError ?? undefined}
        >
          <div className={styles.portalHost}>
            {(() => {
              const address = resolveServerAddress(draft)
              if (address.kind === 'none') return 'No public address yet'
              return <CopyableAddress address={address.value} size={300} />
            })()}
          </div>
        </Field>
        {portalLinked && (
          <Field
            label="Subdomain"
            hint={
              draft.portalHostname
                ? `The public port stays the same, so anyone who saved the old address keeps working until you tell them the new one.${zoneSuffix ? ` Full address: ${subdomainLabel.trim() || labelFromHostname(draft.portalHostname)}.${zoneSuffix}` : ''}`
                : `Pick the name players will connect to.${zoneSuffix ? ` Full address: ${subdomainLabel.trim() || 'name'}.${zoneSuffix}` : ''}`
            }
          >
            <div className={styles.actions}>
              <Input
                value={subdomainLabel}
                onChange={(_, data) => setSubdomainLabel(data.value)}
                placeholder={labelFromHostname(draft.portalHostname) || 'survival'}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void applySubdomain()
                }}
              />
              <Button
                appearance="primary"
                disabled={
                  renamingHost ||
                  !subdomainLabel.trim() ||
                  subdomainLabel.trim() === labelFromHostname(draft.portalHostname)
                }
                onClick={() => void applySubdomain()}
              >
                {renamingHost ? 'Applying…' : draft.portalHostname ? 'Rename' : 'Allocate'}
              </Button>
            </div>
          </Field>
        )}
        <div className={styles.actions}>
          <Button
            icon={<FolderOpen20Regular />}
            onClick={() => native().openFolder(metadata.id)}
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
                  await api().servers.remove(metadata.id, deleteFiles)
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
