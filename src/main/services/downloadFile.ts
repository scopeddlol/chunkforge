import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number | null) => void
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }

  const totalBytes = Number(response.headers.get('content-length') ?? 0)
  let receivedBytes = 0
  const writeStream = createWriteStream(destPath)
  const nodeStream = Readable.fromWeb(response.body as never)
  nodeStream.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length
    onProgress?.(totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : null)
  })
  await pipeline(nodeStream, writeStream)
}
