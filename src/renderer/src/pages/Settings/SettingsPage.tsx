import { useEffect, useMemo, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Field,
  Input,
  Switch,
  Slider,
  Button,
  Divider,
  Spinner,
  Badge,
  Link
} from '@fluentui/react-components'
import {
  FolderOpen20Regular,
  Open16Regular,
  ArrowClockwise20Regular,
  Save20Regular,
  ArrowUndo20Regular
} from '@fluentui/react-icons'
import {
  pluginSourceLabels,
  type AppSettings,
  type PluginSource,
  type ThemePreference
} from '@shared/types'
import { ChunkforgeMark } from '../../components/ChunkforgeMark'
import { FileHubPanel } from './FileHubPanel'
import { ThemePicker } from './ThemePicker'

const useStyles = makeStyles({
  root: { flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  scroll: { flexGrow: 1, overflowY: 'auto', padding: '28px 36px 24px' },
  header: { marginBottom: '22px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  panels: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '660px' },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '20px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1
  },
  panelTitle: { color: tokens.colorNeutralForeground2 },
  row: { display: 'flex', gap: '8px', alignItems: 'flex-end' },
  grow: { flexGrow: 1 },
  sliderRow: { display: 'flex', alignItems: 'center', gap: '14px' },
  sliderValue: { minWidth: '64px', textAlign: 'right', color: tokens.colorNeutralForeground2 },
  sourceList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  javaList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  javaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke3}`
  },
  javaPath: { color: tokens.colorNeutralForeground3, wordBreak: 'break-all' },
  about: { display: 'flex', alignItems: 'center', gap: '14px' },
  muted: { color: tokens.colorNeutralForeground3 },
  // Save bar stays pinned so the button is reachable from any scroll position.
  saveBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 36px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    flexShrink: 0
  },
  saveActions: { display: 'flex', gap: '8px' }
})

const allSources: PluginSource[] = ['modrinth', 'hangar', 'spiget', 'curseforge']

export function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const [saved, setSaved] = useState<AppSettings | null>(null)
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [javaRuntimes, setJavaRuntimes] = useState<Array<{ path: string; majorVersion: number }> | null>(null)
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.chunkforge.settings.get().then((settings) => {
      setSaved(settings)
      setDraft(settings)
    })
  }, [])

  const dirty = useMemo(
    () => (saved && draft ? JSON.stringify(saved) !== JSON.stringify(draft) : false),
    [saved, draft]
  )

  function patch(next: Partial<AppSettings>): void {
    setDraft((prev) => (prev ? { ...prev, ...next } : prev))
  }

  async function save(): Promise<void> {
    if (!draft) return
    setSaving(true)
    try {
      const updated = await window.chunkforge.settings.update(draft)
      setSaved(updated)
      setDraft(updated)
      // Theme and other cross-cutting settings are read elsewhere on demand.
      window.dispatchEvent(new CustomEvent('chunkforge:settings-changed'))
    } finally {
      setSaving(false)
    }
  }

  async function scanJava(): Promise<void> {
    setScanning(true)
    try {
      setJavaRuntimes(await window.chunkforge.settings.detectJava())
    } finally {
      setScanning(false)
    }
  }

  if (!draft) {
    return (
      <div className={styles.scroll}>
        <Spinner label="Loading settings…" />
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <div className={styles.header}>
          <Title2>Settings</Title2>
          <Text className={styles.subtitle} block>
            Preferences apply to Chunkforge itself and to newly created servers.
          </Text>
        </div>

        <div className={styles.panels}>
          <div className={styles.panel}>
            <Text weight="semibold" className={styles.panelTitle}>
              Theme
            </Text>
            <ThemePicker
              value={draft.themePreference}
              onChange={(value: ThemePreference) => patch({ themePreference: value })}
            />
          </div>

          <div className={styles.panel}>
            <Text weight="semibold" className={styles.panelTitle}>
              Behaviour
            </Text>
            <Field label="Console scrollback (lines)">
              <div className={styles.sliderRow}>
                <Slider
                  min={500}
                  max={10000}
                  step={500}
                  value={draft.consoleScrollbackLines}
                  onChange={(_, d) => patch({ consoleScrollbackLines: d.value })}
                />
                <Text className={styles.sliderValue}>{draft.consoleScrollbackLines}</Text>
              </div>
            </Field>
            <Switch
              label="Ask before stopping a running server"
              checked={draft.confirmBeforeStop}
              onChange={(_, d) => patch({ confirmBeforeStop: d.checked })}
            />
          </div>

          <div className={styles.panel}>
            <Text weight="semibold" className={styles.panelTitle}>
              New server defaults
            </Text>
            <Field label="Default install location">
              <div className={styles.row}>
                <Input
                  className={styles.grow}
                  readOnly
                  value={draft.defaultInstallLocation ?? 'Documents\\Chunkforge\\Instances'}
                />
                <Button
                  icon={<FolderOpen20Regular />}
                  onClick={async () => {
                    const picked = await window.chunkforge.settings.pickFolder('Choose default server location')
                    if (picked) patch({ defaultInstallLocation: picked })
                  }}
                >
                  Browse…
                </Button>
                {draft.defaultInstallLocation && (
                  <Button onClick={() => patch({ defaultInstallLocation: null })}>Reset</Button>
                )}
              </div>
            </Field>
            <Field label="Default port">
              <Input
                type="number"
                value={String(draft.defaultPort)}
                onChange={(_, d) => patch({ defaultPort: Number(d.value) || 25565 })}
              />
            </Field>
            <Field label="Default maximum RAM">
              <div className={styles.sliderRow}>
                <Slider
                  min={1024}
                  max={32768}
                  step={512}
                  value={draft.defaultMaxRamMb}
                  onChange={(_, d) => patch({ defaultMaxRamMb: d.value })}
                />
                <Text className={styles.sliderValue}>{(draft.defaultMaxRamMb / 1024).toFixed(1)} GB</Text>
              </div>
            </Field>
          </div>

          <div className={styles.panel}>
            <Text weight="semibold" className={styles.panelTitle}>
              Plugin sources
            </Text>
            <div className={styles.sourceList}>
              {allSources.map((source) => (
                <Switch
                  key={source}
                  label={pluginSourceLabels[source]}
                  checked={draft.enabledPluginSources.includes(source)}
                  onChange={(_, d) =>
                    patch({
                      enabledPluginSources: d.checked
                        ? [...draft.enabledPluginSources, source]
                        : draft.enabledPluginSources.filter((s) => s !== source)
                    })
                  }
                />
              ))}
            </div>
            <Divider />
            <Field
              label="CurseForge API key"
              hint="CurseForge requires a free personal key for third-party apps. Without one, CurseForge results stay disabled."
            >
              <Input
                type="password"
                placeholder="Paste your key…"
                value={draft.curseForgeApiKey}
                onChange={(_, d) => patch({ curseForgeApiKey: d.value })}
              />
            </Field>
            <Link
              appearance="subtle"
              onClick={() => window.chunkforge.plugins.openExternal('https://console.curseforge.com/')}
            >
              Get a key at console.curseforge.com <Open16Regular />
            </Link>
          </div>

          {/* FileHub writes immediately: sign-in and folder choice are actions,
              not form fields, so they don't belong behind the save button. */}
          <FileHubPanel
            settings={draft}
            onPatch={async (p) => {
              const updated = await window.chunkforge.settings.update(p)
              setSaved(updated)
              setDraft((prev) => (prev ? { ...prev, ...p } : prev))
            }}
          />

          <div className={styles.panel}>
            <Text weight="semibold" className={styles.panelTitle}>
              Java runtimes
            </Text>
            <Text size={200} className={styles.muted}>
              Chunkforge picks the Java version each server requires, downloading one automatically if needed.
            </Text>
            <div className={styles.row}>
              <Button icon={<ArrowClockwise20Regular />} disabled={scanning} onClick={scanJava}>
                {scanning ? 'Scanning…' : 'Scan for Java'}
              </Button>
            </div>
            {javaRuntimes && (
              <div className={styles.javaList}>
                {javaRuntimes.length === 0 && <Text className={styles.muted}>No Java installations found.</Text>}
                {javaRuntimes.map((runtime) => (
                  <div className={styles.javaRow} key={runtime.path}>
                    <Badge appearance="tint" color="brand">
                      Java {runtime.majorVersion}
                    </Badge>
                    <Text size={200} className={styles.javaPath}>
                      {runtime.path}
                    </Text>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.panel}>
            <Text weight="semibold" className={styles.panelTitle}>
              Storage
            </Text>
            <Button icon={<FolderOpen20Regular />} onClick={() => window.chunkforge.settings.openDataFolder()}>
              Open Chunkforge Data Folder
            </Button>
          </div>

          <div className={styles.panel}>
            <div className={styles.about}>
              <ChunkforgeMark size={44} />
              <div>
                <Text weight="semibold" block>
                  Chunkforge
                </Text>
                <Text size={200} className={styles.muted} block>
                  Version 0.2.0 — Forge Your World.
                </Text>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.saveBar}>
        <Text size={200} className={styles.muted}>
          {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
        </Text>
        <div className={styles.saveActions}>
          <Button
            icon={<ArrowUndo20Regular />}
            disabled={!dirty || saving}
            onClick={() => saved && setDraft(saved)}
          >
            Discard
          </Button>
          <Button appearance="primary" icon={<Save20Regular />} disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
