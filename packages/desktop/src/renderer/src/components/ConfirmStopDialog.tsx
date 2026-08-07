import { useCallback, useState, type JSX } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Text
} from '@fluentui/react-components'
import { api } from '../api'

interface PendingStop {
  instanceId: string
  name: string
}

/**
 * Gates server stops behind a confirmation when the user has that setting on.
 * Returns a `requestStop` to call instead of stopping directly, plus the dialog
 * element to render.
 */
export function useConfirmStop(): {
  requestStop: (instanceId: string, name: string) => Promise<void>
  dialog: JSX.Element
} {
  const [pending, setPending] = useState<PendingStop | null>(null)

  const requestStop = useCallback(async (instanceId: string, name: string) => {
    const settings = await api().settings.get()
    if (!settings.confirmBeforeStop) {
      await api().servers.stop(instanceId)
      return
    }
    setPending({ instanceId, name })
  }, [])

  const confirm = useCallback(async () => {
    if (!pending) return
    const { instanceId } = pending
    setPending(null)
    await api().servers.stop(instanceId)
  }, [pending])

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(_, d) => !d.open && setPending(null)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Stop “{pending?.name}”?</DialogTitle>
          <DialogContent>
            <Text>
              Players currently online will be disconnected. The world is saved before the server
              shuts down.
            </Text>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button appearance="primary" onClick={confirm}>
              Stop Server
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )

  return { requestStop, dialog }
}
