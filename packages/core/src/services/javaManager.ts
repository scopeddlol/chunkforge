import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { chmod, mkdir, readdir, rm } from 'fs/promises'
import { join } from 'path'
import AdmZip from 'adm-zip'
import * as tar from 'tar'
import { runtimesRoot } from './paths'
import { downloadFile } from './downloadFile'

export interface DetectedJava {
  path: string
  majorVersion: number
}

/**
 * Everything here is platform-branched on purpose, once, at the top — Java's
 * own layout differs enough between Windows and everything else (`java.exe`
 * vs `java`, zip vs tar.gz, and Windows alone not caring about the executable
 * bit) that scattering `process.platform` checks through the rest of the file
 * is how one of them gets missed. This ran Windows-only for a long time
 * because Chunkforge Desktop was the only thing that ever called it; a node
 * running in a Linux container hits every one of these differences at once.
 */
const isWindows = process.platform === 'win32'
const JAVA_BINARY = isWindows ? 'java.exe' : 'java'
const ADOPTIUM_OS = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'

const CANDIDATE_DIRS = isWindows
  ? [
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files (x86)\\Java'
    ]
  : ['/usr/lib/jvm', '/opt/java', '/usr/lib64/jvm']

function parseMajorVersion(versionOutput: string): number | null {
  // "openjdk version "21.0.7" 2026-04-21" or legacy "1.8.0_411"
  const match = versionOutput.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null
  const first = parseInt(match[1], 10)
  if (first === 1 && match[2]) return parseInt(match[2], 10)
  return first
}

function probeJavaBinary(javaPath: string): Promise<DetectedJava | null> {
  return new Promise((resolve) => {
    const child = spawn(javaPath, ['-version'])
    let output = ''
    child.stderr.on('data', (chunk) => (output += chunk.toString()))
    child.stdout.on('data', (chunk) => (output += chunk.toString()))
    child.on('error', () => resolve(null))
    child.on('close', () => {
      const majorVersion = parseMajorVersion(output)
      resolve(majorVersion ? { path: javaPath, majorVersion } : null)
    })
  })
}

async function scanDirForJavaHomes(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name, 'bin', JAVA_BINARY))
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

  // Chunkforge-managed runtimes nest one level deeper than system installs:
  // Runtimes/jdk-<major>/<extracted-jdk-dir>/bin/<java>. Scan both depths so
  // an already-downloaded runtime is reused instead of fetched again.
  const runtimesDir = runtimesRoot()
  if (existsSync(runtimesDir)) {
    for (const p of await scanDirForJavaHomes(runtimesDir)) candidatePaths.add(p)
    try {
      for (const entry of await readdir(runtimesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        for (const p of await scanDirForJavaHomes(join(runtimesDir, entry.name))) candidatePaths.add(p)
      }
    } catch {
      // Unreadable runtimes dir just means no managed runtimes to reuse.
    }
  }

  if (process.env.JAVA_HOME) {
    const p = join(process.env.JAVA_HOME, 'bin', JAVA_BINARY)
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

/**
 * Extracts the archive Adoptium actually ships for this platform. Windows
 * builds are `.zip`; everything else is `.tar.gz`, and tar is what restores
 * the executable bit on the way out — a zip extractor asked to unpack one
 * would not even understand the format, and unpacking a zip on Linux with a
 * library that does not restore Unix permissions is exactly how a downloaded
 * `java` ends up unrunnable.
 */
async function extractJdkArchive(archivePath: string, targetDir: string): Promise<void> {
  if (isWindows) {
    const zip = new AdmZip(archivePath)
    zip.extractAllTo(targetDir, true)
    return
  }
  await tar.extract({ file: archivePath, cwd: targetDir })
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

  const apiUrl = `https://api.adoptium.net/v3/assets/latest/${majorVersion}/hotspot?architecture=x64&image_type=jdk&os=${ADOPTIUM_OS}&vendor=eclipse`
  const apiResponse = await fetch(apiUrl)
  if (!apiResponse.ok) {
    throw new Error(`Adoptium API request failed (${apiResponse.status}) for Java ${majorVersion}`)
  }
  const assets = (await apiResponse.json()) as Array<{
    binary: { package: { link: string; name: string } }
  }>
  const downloadUrl = assets[0]?.binary?.package?.link
  if (!downloadUrl) throw new Error(`No Adoptium build found for Java ${majorVersion}`)

  onProgress?.({ stage: 'downloading', percent: 0 })
  // The archive's own extension, not an assumed one: Adoptium's Windows
  // builds are .zip and everything else is .tar.gz, and picking the wrong
  // extractor for what actually downloaded fails in a way that looks nothing
  // like a format mismatch.
  const archiveName = assets[0].binary.package.name
  const archivePath = join(targetDir, archiveName)
  await downloadFile(downloadUrl, archivePath, {
    onProgress: (percent) => onProgress?.({ stage: 'downloading', percent })
  })

  onProgress?.({ stage: 'extracting', percent: null })
  await extractJdkArchive(archivePath, targetDir)
  await rm(archivePath)

  const extractedRoot = (await readdir(targetDir)).find((name) => name.toLowerCase().startsWith('jdk'))
  if (!extractedRoot) throw new Error('Unexpected Adoptium archive layout')

  const javaPath = join(targetDir, extractedRoot, 'bin', JAVA_BINARY)
  if (!existsSync(javaPath)) throw new Error('Java executable missing after extraction')

  if (!isWindows) {
    // Belt and braces on top of tar's own permission handling: an archive
    // built or transferred in a way that dropped the executable bit should
    // not turn into a silent EACCES the first time something tries to spawn
    // this binary, days or containers away from whoever installed the runtime.
    await chmod(javaPath, 0o755).catch(() => undefined)
  }

  onProgress?.({ stage: 'done', percent: 100 })
  return javaPath
}
