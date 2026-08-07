import { createWriteStream } from 'fs'
import { createHash } from 'crypto'
import { readFile, rename, rm } from 'fs/promises'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'

export interface DownloadOptions {
  onProgress?: (percent: number | null) => void
  /** Expected sha256 hex digest (PaperMC publishes these). A mismatch fails the download. */
  sha256?: string
  /** Expected sha1 hex digest (Mojang publishes these). A mismatch fails the download. */
  sha1?: string
}

/**
 * Downloads to a `.part` file and renames on success, so an interrupted or
 * corrupt transfer never leaves a half-written file at the destination.
 *
 * Chunks are copied via Buffer.from before being written: Electron's fetch is
 * Chromium-backed and hands out views over recycled buffers, which get
 * overwritten before the write stream flushes them — producing a file of the
 * right length with scrambled contents.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  options: DownloadOptions = {}
): Promise<void> {
  const { onProgress, sha256, sha1 } = options
  const partPath = `${destPath}.part`

  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }

  const totalBytes = Number(response.headers.get('content-length') ?? 0)
  let receivedBytes = 0

  const progressTap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length
      onProgress?.(totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : null)
      callback(null, Buffer.from(chunk))
    }
  })

  try {
    await pipeline(Readable.fromWeb(response.body as never), progressTap, createWriteStream(partPath))

    if (totalBytes > 0 && receivedBytes !== totalBytes) {
      throw new Error(`Download truncated: expected ${totalBytes} bytes, got ${receivedBytes}`)
    }

    const expected = sha256 ? { algorithm: 'sha256', digest: sha256 } : sha1 ? { algorithm: 'sha1', digest: sha1 } : null
    if (expected) {
      const actual = createHash(expected.algorithm).update(await readFile(partPath)).digest('hex')
      if (actual !== expected.digest) {
        throw new Error(
          `Checksum mismatch for ${url} — expected ${expected.algorithm} ${expected.digest}, got ${actual}`
        )
      }
    }

    await rename(partPath, destPath)
  } catch (err) {
    await rm(partPath, { force: true })
    throw err
  }
}
