import { open, stat } from 'fs/promises'
import { basename } from 'path'
import { createHash } from 'crypto'

/**
 * Client for a self-hosted FileHub instance (github.com/scopeddlol/filehub).
 *
 * Mirrors the protocol used by FileHub's own desktop client: cookie session
 * auth, then a chunked resumable upload (init -> PUT chunks -> complete).
 */

const CHUNK_CONCURRENCY = 4

/** Whatever the ambient fetch accepts as a request body, without naming DOM types. */
type FetchBody = NonNullable<Parameters<typeof fetch>[1]>['body']

export class FileHubError extends Error {
  readonly status: number | undefined
  readonly totpRequired: boolean

  constructor(message: string, status?: number, totpRequired = false) {
    super(message)
    this.name = 'FileHubError'
    this.status = status
    this.totpRequired = totpRequired
  }
}

interface UploadInitResponse {
  uploadId: string
  chunkSize: number
  received?: number[]
}

interface CompleteResponse {
  fileId: string
}

export interface FileHubFolder {
  id: string
  name: string
  parentId?: string | null
}

export class FileHubClient {
  private readonly baseUrl: string
  private cookie: string | null

  constructor(baseUrl: string, cookie: string | null = null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.cookie = cookie
  }

  getCookie(): string | null {
    return this.cookie
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers = { ...extra }
    if (this.cookie) headers.cookie = `fh_session=${this.cookie}`
    return headers
  }

  private async api<T>(
    pathname: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string>; retries?: number } = {}
  ): Promise<T> {
    const { retries = 0, method = 'GET', body, headers: extraHeaders } = options
    const isBuffer = Buffer.isBuffer(body)

    // Derived from fetch itself rather than naming BodyInit, which only exists
    // when the DOM lib is loaded — core targets Node. Buffers are valid bodies
    // for undici but the ambient typings don't say so, hence the cast.
    const requestBody =
      body === undefined ? undefined : isBuffer ? (body as unknown as FetchBody) : JSON.stringify(body)

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(this.baseUrl + pathname, {
        method,
        headers: this.headers({
          ...(body && !isBuffer ? { 'content-type': 'application/json' } : {}),
          ...extraHeaders
        }),
        body: requestBody
      })

      let data: Record<string, unknown> = {}
      try {
        data = (await response.json()) as Record<string, unknown>
      } catch {
        // Some endpoints return an empty body on success.
      }

      if (response.ok) return data as T

      // Chunk PUTs are idempotent, so retrying rate limits and 5xx is safe.
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        const retryAfter = Number(response.headers.get('retry-after')) || 0
        await sleep(Math.max(retryAfter * 1000, Math.min(30_000, 1000 * 2 ** attempt)))
        continue
      }

      throw new FileHubError(
        typeof data.error === 'string' ? data.error : `HTTP ${response.status}`,
        response.status
      )
    }
  }

  async login(username: string, password: string, totp?: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(totp ? { username, password, totp } : { username, password })
    })

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      throw new FileHubError(
        typeof data.error === 'string' ? data.error : `HTTP ${response.status}`,
        response.status,
        data.totpRequired === true
      )
    }

    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const match = /^fh_session=([^;]+)/.exec(cookie)
      if (match) this.cookie = match[1]
    }
    if (!this.cookie) throw new FileHubError('FileHub did not return a session cookie')
  }

  async me(): Promise<{ username?: string }> {
    return this.api('/api/auth/me')
  }

  async listFolders(): Promise<FileHubFolder[]> {
    const data = await this.api<{ folders?: FileHubFolder[] }>('/api/folders')
    return data.folders ?? []
  }

  async createFolder(name: string, parentId: string | null): Promise<string> {
    const data = await this.api<{ folder?: FileHubFolder; id?: string }>('/api/folders', {
      method: 'POST',
      body: { name, parentId }
    })
    const id = data.folder?.id ?? data.id
    if (!id) throw new FileHubError('FileHub did not return the new folder id')
    return id
  }

  /**
   * Finds a child folder by name under `parentId`, creating it if absent, so
   * each server's backups land in their own folder.
   */
  async ensureFolder(name: string, parentId: string | null): Promise<string> {
    const folders = await this.listFolders()
    const existing = folders.find(
      (f) => f.name.toLowerCase() === name.toLowerCase() && (f.parentId ?? null) === parentId
    )
    if (existing) return existing.id
    return this.createFolder(name, parentId)
  }

  /** Uploads a local file, returning FileHub's file id. */
  async uploadFile(
    filePath: string,
    options: { parentId?: string | null; onProgress?: (percent: number) => void } = {}
  ): Promise<string> {
    const { parentId = null, onProgress } = options
    const info = await stat(filePath)
    const name = basename(filePath)

    // Same resume key derivation as FileHub's desktop client, so an interrupted
    // upload of the same file resumes instead of restarting.
    const resumeKey = createHash('sha256')
      .update(`${name}:${info.size}:${Math.floor(info.mtimeMs)}:${parentId ?? ''}`)
      .digest('hex')
      .slice(0, 32)

    const init = await this.api<UploadInitResponse>('/api/uploads/init', {
      method: 'POST',
      body: {
        filename: name,
        size: info.size,
        mime: 'application/zip',
        folder: '',
        parentId,
        resumeKey
      }
    })

    const { uploadId, chunkSize } = init
    const totalChunks = Math.max(1, Math.ceil(info.size / chunkSize))
    const alreadyDone = new Set(init.received ?? [])

    let bytesDone = 0
    for (const index of alreadyDone) bytesDone += Math.min(chunkSize, info.size - index * chunkSize)
    onProgress?.(Math.round((bytesDone / info.size) * 100))

    const pending: number[] = []
    for (let i = 0; i < totalChunks; i++) if (!alreadyDone.has(i)) pending.push(i)

    const handle = await open(filePath, 'r')
    try {
      const workers = Array.from(
        { length: Math.min(CHUNK_CONCURRENCY, Math.max(1, pending.length)) },
        async () => {
          for (;;) {
            const index = pending.shift()
            if (index === undefined) return
            const start = index * chunkSize
            const length = Math.min(chunkSize, info.size - start)
            const buffer = Buffer.alloc(length)
            await handle.read(buffer, 0, length, start)

            await this.api(`/api/uploads/${uploadId}/chunk/${index}`, {
              method: 'PUT',
              headers: { 'content-type': 'application/octet-stream' },
              body: buffer,
              retries: 6
            })

            bytesDone += length
            onProgress?.(Math.round((bytesDone / info.size) * 100))
          }
        }
      )
      await Promise.all(workers)
    } catch (err) {
      await this.api(`/api/uploads/${uploadId}`, { method: 'DELETE' }).catch(() => undefined)
      throw err
    } finally {
      await handle.close()
    }

    const complete = await this.api<CompleteResponse>(`/api/uploads/${uploadId}/complete`, {
      method: 'POST'
    })
    return complete.fileId
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
