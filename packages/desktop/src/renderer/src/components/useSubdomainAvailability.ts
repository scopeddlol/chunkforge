import { useEffect, useState } from 'react'
import type { DomainAvailability } from '@chunkforge/api/client'
import { api } from '../api'

/**
 * Asks Portal whether a subdomain label is free, as the user types.
 *
 * Debounced, because this fires on every keystroke and the answer is only
 * interesting once someone stops typing. Requests are also sequenced: a slow
 * reply for "surv" must never overwrite the answer for "survival", which is
 * how these checks end up confidently reporting the wrong thing.
 *
 * Returns null when there is nothing to say — no Portal, or an empty box —
 * so callers can render nothing rather than an empty verdict.
 */
export function useSubdomainAvailability(
  label: string,
  options?: { instanceId?: string; enabled?: boolean }
): { status: DomainAvailability | null; checking: boolean } {
  const [status, setStatus] = useState<DomainAvailability | null>(null)
  const [checking, setChecking] = useState(false)
  const enabled = options?.enabled ?? true
  const instanceId = options?.instanceId

  useEffect(() => {
    const trimmed = label.trim()
    if (!enabled || !trimmed) {
      setStatus(null)
      setChecking(false)
      return
    }

    let cancelled = false
    setChecking(true)
    const timer = setTimeout(() => {
      api()
        .portal.checkDomain(trimmed, instanceId)
        .then((result) => {
          if (!cancelled) setStatus(result)
        })
        .catch(() => {
          // A Portal that cannot be reached is not a verdict. Saying nothing
          // beats claiming a name is taken because the network blipped.
          if (!cancelled) setStatus(null)
        })
        .finally(() => {
          if (!cancelled) setChecking(false)
        })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [label, instanceId, enabled])

  return { status, checking }
}
