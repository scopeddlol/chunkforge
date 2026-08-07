import { useEffect, useState, type JSX } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Spinner,
  Text,
  Dropdown,
  Option,
  Field,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
  Badge
} from '@fluentui/react-components'
import { Open16Regular } from '@fluentui/react-icons'
import type { InstanceSummary, PluginSearchResult, PluginVersion } from '@shared/types'

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '380px' },
  versionMeta: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' },
  hint: { color: tokens.colorNeutralForeground3 }
})

interface InstallDialogProps {
  plugin: PluginSearchResult | null
  instances: InstanceSummary[]
  preselectedInstanceId: string | null
  onClose: () => void
  onInstalled: () => void
}

export function InstallDialog({
  plugin,
  instances,
  preselectedInstanceId,
  onClose,
  onInstalled
}: InstallDialogProps): JSX.Element {
  const styles = useStyles()
  const [versions, setVersions] = useState<PluginVersion[] | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [instanceId, setInstanceId] = useState<string | null>(preselectedInstanceId)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!plugin) return
    setVersions(null)
    setSelectedVersionId(null)
    setError(null)
    setDone(false)
    setInstanceId(preselectedInstanceId ?? instances[0]?.id ?? null)

    window.chunkforge.plugins
      .listVersions(plugin.source, plugin.id)
      .then((result) => {
        setVersions(result)
        setSelectedVersionId(result[0]?.id ?? null)
      })
      .catch((err: Error) => setError(err.message))
  }, [plugin, preselectedInstanceId, instances])

  const selectedInstance = instances.find((i) => i.id === instanceId)
  const selectedVersion = versions?.find((v) => v.id === selectedVersionId) ?? null

  // Surface compatibility rather than silently installing a mismatched build.
  const compatible =
    selectedVersion && selectedInstance && selectedVersion.gameVersions.length > 0
      ? selectedVersion.gameVersions.includes(selectedInstance.minecraftVersion)
      : null

  async function handleInstall(): Promise<void> {
    if (!plugin || !selectedVersion || !instanceId) return
    setInstalling(true)
    setError(null)
    try {
      await window.chunkforge.plugins.install(instanceId, selectedVersion, plugin.name)
      setDone(true)
      onInstalled()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed.')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog open={plugin !== null} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Install {plugin?.name}</DialogTitle>
          <DialogContent className={styles.body}>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {done && (
              <MessageBar intent="success">
                <MessageBarBody>Installed to {selectedInstance?.name}. Restart the server to load it.</MessageBarBody>
              </MessageBar>
            )}

            <Field label="Install to server">
              <Dropdown
                value={selectedInstance?.name ?? 'No servers yet'}
                selectedOptions={instanceId ? [instanceId] : []}
                disabled={instances.length === 0}
                onOptionSelect={(_, data) => setInstanceId(data.optionValue ?? null)}
              >
                {instances.map((instance) => (
                  <Option key={instance.id} value={instance.id}>
                    {`${instance.name} (${instance.serverType} ${instance.minecraftVersion})`}
                  </Option>
                ))}
              </Dropdown>
            </Field>

            {!versions && !error && <Spinner size="tiny" label="Loading versions…" />}

            {versions && versions.length === 0 && (
              <Text className={styles.hint}>No downloadable versions were published for this plugin.</Text>
            )}

            {versions && versions.length > 0 && (
              <Field label="Version">
                <Dropdown
                  value={selectedVersion?.name ?? ''}
                  selectedOptions={selectedVersionId ? [selectedVersionId] : []}
                  onOptionSelect={(_, data) => setSelectedVersionId(data.optionValue ?? null)}
                >
                  {versions.map((version) => (
                    <Option key={version.id} value={version.id}>
                      {version.name}
                    </Option>
                  ))}
                </Dropdown>
                {selectedVersion && (
                  <div className={styles.versionMeta}>
                    {compatible === true && (
                      <Badge appearance="tint" color="success">
                        Compatible with {selectedInstance?.minecraftVersion}
                      </Badge>
                    )}
                    {compatible === false && (
                      <Badge appearance="tint" color="warning">
                        Not listed for {selectedInstance?.minecraftVersion}
                      </Badge>
                    )}
                    {selectedVersion.gameVersions.slice(0, 3).map((gv) => (
                      <Badge key={gv} appearance="outline" color="informative">
                        {gv}
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>
            )}

            {selectedVersion && !selectedVersion.downloadUrl && selectedVersion.externalUrl && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  This one is hosted off-site, so it can&apos;t be installed automatically.
                </MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            {selectedVersion?.externalUrl && (
              <Button
                icon={<Open16Regular />}
                onClick={() => window.chunkforge.plugins.openExternal(selectedVersion.externalUrl as string)}
              >
                Open download page
              </Button>
            )}
            <Button appearance="secondary" onClick={onClose}>
              {done ? 'Close' : 'Cancel'}
            </Button>
            <Button
              appearance="primary"
              disabled={!selectedVersion?.downloadUrl || !instanceId || installing || done}
              onClick={handleInstall}
            >
              {installing ? 'Installing…' : 'Install'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
