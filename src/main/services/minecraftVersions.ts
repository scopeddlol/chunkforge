function parseVersion(version: string): number[] {
  return version
    .split('.')
    .map((part) => parseInt(part.replace(/\D.*$/, ''), 10))
    .map((n) => (Number.isNaN(n) ? 0 : n))
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Minimum Java major version a given Minecraft server version needs to run. */
export function requiredJavaMajor(minecraftVersion: string): number {
  if (compareVersions(minecraftVersion, '1.20.5') >= 0) return 21
  if (compareVersions(minecraftVersion, '1.17') >= 0) return 17
  return 8
}
