// Rasterizes the Chunkforge mark into build/icon.ico (+ PNGs) for the
// Windows app icon and installer. Run with: node scripts/generate-icon.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.join(__dirname, '..', 'build')

// Same geometry as src/renderer/src/components/ChunkforgeMark.tsx, on an
// obsidian rounded-square backdrop for the standalone app icon.
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#1B1B1F" />
  <g transform="translate(48 48) scale(9)">
    <path d="M24 3 L44 14.5 V33.5 L24 45 L4 33.5 V14.5 Z" fill="#1B1B1F" />
    <path d="M24 3 L44 14.5 L24 26 L4 14.5 Z" fill="#F2A87C" />
    <path d="M24 26 L44 14.5 V33.5 L24 45 Z" fill="#CF4718" />
    <path d="M24 26 L4 14.5 V33.5 L24 45 Z" fill="#E8793A" />
    <path
      d="M27 9 L18 21 L23 21 L20 30 L31 17 L25.5 17 Z"
      fill="#FCE3D2"
      stroke="#1B1B1F"
      stroke-width="0.75"
      stroke-linejoin="round"
    />
  </g>
</svg>
`.trim()

async function main() {
  await mkdir(buildDir, { recursive: true })

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const pngBuffers = await Promise.all(
    sizes.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer())
  )

  const icoBuffer = await pngToIco(pngBuffers)
  await writeFile(path.join(buildDir, 'icon.ico'), icoBuffer)

  const icon512 = await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer()
  await writeFile(path.join(buildDir, 'icon.png'), icon512)

  console.log('Wrote build/icon.ico and build/icon.png')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
