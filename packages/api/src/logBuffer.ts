import type { LogLineEvent } from '@chunkforge/core'

/**
 * Recent console output, per server, kept in memory.
 *
 * The console used to exist only as a live event stream, so the log panel was
 * empty every time it mounted — leaving a server's page and coming back looked
 * exactly like a server that had printed nothing. Keeping the tail here means
 * the panel can open with the history already in place and then follow along
 * live, and it works the same for a server on a node: that node buffers its
 * own output, and the request for it is forwarded there like every other
 * `/api/servers/:id/...` call.
 *
 * In memory on purpose. This is the tail of a console, not an audit log — the
 * server's own logs/ directory is the durable copy, and a restart genuinely
 * has nothing to show yet.
 */

const MAX_LINES_PER_INSTANCE = 2000

const buffers = new Map<string, LogLineEvent[]>()

export function recordLogLine(event: LogLineEvent): void {
  const existing = buffers.get(event.instanceId)
  if (!existing) {
    buffers.set(event.instanceId, [event])
    return
  }
  existing.push(event)
  if (existing.length > MAX_LINES_PER_INSTANCE) {
    existing.splice(0, existing.length - MAX_LINES_PER_INSTANCE)
  }
}

export function recentLogLines(instanceId: string, limit = MAX_LINES_PER_INSTANCE): LogLineEvent[] {
  const lines = buffers.get(instanceId) ?? []
  return lines.length > limit ? lines.slice(lines.length - limit) : [...lines]
}

/** Called when a server is deleted, so its output does not outlive it. */
export function forgetLogLines(instanceId: string): void {
  buffers.delete(instanceId)
}
