import { useEffect, useState, type JSX } from 'react'
import {
  makeStyles,
  tokens,
  Title2,
  Text,
  Field,
  Input,
  Dropdown,
  Option,
  Switch,
  Slider,
  Button,
  Divider,
  Spinner,
  Badge,
  Link
} from '@fluentui/react-components'
import { FolderOpen20Regular, Open16Regular, ArrowClockwise20Regular } from '@fluentui/react-icons'
import {
  pluginSourceLabels,
  type AppSettings,
  type PluginSource,
  type ThemePreference
} from '@shared/types'
import { ChunkforgeMark } from '../../components/ChunkforgeMark'

const useStyles = makeStyles({
  root: { flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '28px 36px', overflowY: 'auto' },
  header: { marginBottom: '22px' },
  subtitle: { color: tokens.colorNeutralForeground3, marginTop: '4px' },
  panels: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '620px' },
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
  muted: { color: tokens.colorNeutralForeground3 }
})

const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match Windows' },
  { value: 'dark', label: 'Dark (OLED)' },
  { value: 'light', label: 'Light' }
]

const allSources: PluginSource[] = ['modrinth', 'hangar', 'spiget', 'curseforge']

export function SettingsPage(): JSX.Element {
  const styles = useStyles()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [javaRuntimes, setJavaRuntimes] = useState<Array<{ path: string; majorVersion: number }> | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    window.chunkforge.settings.get().then(setSettings)
  }, [])

  async function patch(next: Partial<AppSettings>): Promise<void> {
    const updated = await window.chunkforge.settings.update(next)
    setSettings(updated)
  }

  async function scanJava(): Promise<void> {
    setScanning(true)
    try {
      setJavaRuntimes(await window.chunkforge.settings.detectJava())
    } finally {
      setScanning(false)
    }
  }

  if (!settings) {
    return (
      <div className={styles.root}>
        <Spinner label="Loading settings…" />
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Title2>Settings</Title2>
        <Text className={styles.subtitle} block>
          Preferences apply to Chunkforge itself and to newly created servers.
        </Text>
      </div>

      <div className={styles.panels}>
        <div className={styles.panel}>
          <Text weight="semibold" className={styles.panelTitle}>
            Appearance
          </Text>
          <Field label="Theme">
            <Dropdown
              value={themeOptions.find((t) => t.value === settings.themePreference)?.label ?? 'Match Windows'}
              selectedOptions={[settings.themePreference]}
              onOptionSelect={(_, d) =>
                d.optionValue && patch({ themePreference: d.optionValue as ThemePreference })
              }
            >
              {themeOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Console scrollback (lines)">
            <div className={styles.sliderRow}>
              <Slider
                min={500}
                max={10000}
                step={500}
                value={settings.consoleScrollbackLines}
                onChange={(_, d) => patch({ consoleScrollbackLines: d.value })}
              />
              <Text className={styles.sliderValue}>{settings.consoleScrollbackLines}</Text>
            </div>
          </Field>
          <Switch
            label="Ask before stopping a running server"
            checked={settings.confirmBeforeStop}
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
                value={settings.defaultInstallLocation ?? 'Documents\\Chunkforge\\Instances'}
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
              {settings.defaultInstallLocation && (
                <Button onClick={() => patch({ defaultInstallLocation: null })}>Reset</Button>
              )}
            </div>
          </Field>
          <Field label="Default port">
            <Input
              type="number"
              value={String(settings.defaultPort)}
              onChange={(_, d) => patch({ defaultPort: Number(d.value) || 25565 })}
            />
          </Field>
          <Field label="Default maximum RAM">
            <div className={styles.sliderRow}>
              <Slider
                min={1024}
                max={16384}
                step={512}
                value={settings.defaultMaxRamMb}
                onChange={(_, d) => patch({ defaultMaxRamMb: d.value })}
              />
              <Text className={styles.sliderValue}>{(settings.defaultMaxRamMb / 1024).toFixed(1)} GB</Text>
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
                checked={settings.enabledPluginSources.includes(source)}
                onChange={(_, d) =>
                  patch({
                    enabledPluginSources: d.checked
                      ? [...settings.enabledPluginSources, source]
                      : settings.enabledPluginSources.filter((s) => s !== source)
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
              value={settings.curseForgeApiKey}
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
          <Button
            icon={<FolderOpen20Regular />}
            onClick={() => window.chunkforge.settings.openDataFolder()}
          >
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
                Version 0.1.0 — Forge Your World.
              </Text>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
