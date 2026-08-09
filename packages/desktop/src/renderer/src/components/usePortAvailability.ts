import { useEffect, useState } from 'react'
import { api } from '../api'

export interface PortAvailability {
  checking: boolean
  available: boolean
  /** True when the machine that would run the server could not be asked. */
  unknown: boolean
  reason: string | null
  suggestion: number | null
}

const IDLE: PortAvailability = {
  checking: false,
  available: true,
  unknown: false,
  reason: null,
  suggestion: null
}

/**
 * Asks whether a port is usable on the machine that will actually run the
 * server — which is the node when one is chosen, and this machine otherwise.
 *
 * Debounced, because this fires on every keystroke in a number field and each
 * check on a node is a round trip through Portal. Answers that arrive after
 * the port has changed again are discarded rather than shown, so a slow reply
 * about 2556 never lands as a verdict on 25565.
 */
export function usePortAvailability(port: number, nodeId?: string | null, instanceId?: string): PortAvailability {
  const [state, setState] = useState<PortAvailability>(IDLE)

  useEffect(() => {
    if (!Number.isInteger(port) || port <= 0) {
      setState(IDLE)
      return
    }
    let cancelled = false
    setState((prev) => ({ ...prev, checking: true }))

    const timer = setTimeout(() => {
      api()
        .ports.check(port, nodeId ?? undefined, instanceId)
        .then((result) => {
          if (cancelled) return
          setState({
            checking: false,
            available: result.available,
            unknown: Boolean(result.unknown),
            reason: result.unknown
              ? 'Could not reach that node to check the port. It will be checked again when the server starts.'
              : result.reason,
            suggestion: result.suggestion ?? null
          })
        })
        .catch(() => {
          // A failed check must not read as "taken" — the port may be fine.
          if (!cancelled) setState({ ...IDLE, unknown: true })
        })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [port, nodeId, instanceId])

  return state
}
