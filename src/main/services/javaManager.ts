import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, readdir, rm } from 'fs/promises'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { runtimesRoot } from './paths'
import { downloadFile } from './downloadFile'

export interface DetectedJava {
  path: string
  majorVersion: number
}

const CANDIDATE_DIRS = [
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Microsoft',
  'C:\\Program Files (x86)\\Java'
]

function parseMajorVersion(versionOutput: string): number | null {
  // "openjdk version "21.0.7" 2026-04-21" or legacy "1.8.0_411"
  const match = versionOutput.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null
  const first = parseInt(match[1], 10)
  if (first === 1 && match[2]) return parseInt(match[2], 10)
  return first
}

function probeJavaBinary(javaExePath: string): Promise<DetectedJava | null> {
  return new Promise((resolve) => {
    const child = spawn(javaExePath, ['-version'])
    let output = ''
    child.stderr.on('data', (chunk) => (output += chunk.toString()))
    child.stdout.on('data', (chunk) => (output += chunk.toString()))
    child.on('error', () => resolve(null))
    child.on('close', () => {
      const majorVersion = parseMajorVersion(output)
      resolve(majorVersion ? { path: javaExePath, majorVersion } : null)
    })
  })
}

async function scanDirForJavaHomes(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name, 'bin', 'java.exe'))
      .filter((p) => existsSync(p))
  } catch {
    return []
  }
}

export async function detectInstalledJava(): Promise<DetectedJava[]> {
  const candidatePaths = new Set<string>()

  for (const dir of CANDIDATE_DIRS) {
    for (const p of await scanDirForJavaHomes(dir)) candidatePaths.add(p)
  }

  const runtimesDir = runtimesRoot()
  if (existsSync(runtimesDir)) {
    for (const p of await scanDirForJavaHomes(runtimesDir)) candidatePaths.add(p)
  }

  if (process.env.JAVA_HOME) {
    const p = join(process.env.JAVA_HOME, 'bin', 'java.exe')
    if (existsSync(p)) candidatePaths.add(p)
  }
  candidatePaths.add('java')

  const results = await Promise.all([...candidatePaths].map(probeJavaBinary))
  return results.filter((r): r is DetectedJava => r !== null)
}

export interface JavaProgress {
  stage: 'checking' | 'downloading' | 'extracting' | 'done'
  percent: number | null
}

export async function ensureJavaRuntime(
  majorVersion: number,
  onProgress?: (progress: JavaProgress) => void
): Promise<string> {
  onProgress?.({ stage: 'checking', percent: null })
  const installed = await detectInstalledJava()
  const match = installed.find((j) => j.majorVersion >= majorVersion)
  if (match) return match.path

  const targetDir = join(runtimesRoot(), `jdk-${majorVersion}`)
  await mkdir(targetDir, { recursive: true })

  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse`
  const apiResponse = await fetch(apiUrl)
  if (!apiResponse.ok) {
    throw new Error(`Adoptium API request failed (${apiResponse.status}) for Java ${majorVersion}`)
  }
  const assets = (await apiResponse.json()) as Array<{ binary: { package: { link: string } } }>
  const downloadUrl = assets[0]?.binary?.package?.link
  if (!downloadUrl) throw new Error(`No Adoptium build found for Java ${majorVersion}`)

  onProgress?.({ stage: 'downloading', percent: 0 })
  const zipPath = join(targetDir, 'jdk.zip')
  await downloadFile(downloadUrl, zipPath, (percent) => onProgress?.({ stage: 'downloading', percent }))

  onProgress?.({ stage: 'extracting', percent: null })
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(targetDir, true)
  await rm(zipPath)

  const extractedRoot = (await readdir(targetDir)).find((name) => name.toLowerCase().startsWith('jdk'))
  if (!extractedRoot) throw new Error('Unexpected Adoptium archive layout')

  const javaExe = join(targetDir, extractedRoot, 'bin', 'java.exe')
  if (!existsSync(javaExe)) throw new Error('Java executable missing after extraction')

  onProgress?.({ stage: 'done', percent: 100 })
  return javaExe
}
