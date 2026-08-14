import { createHash } from 'node:crypto'

export interface BundleEntry {
  path: string
  content: Uint8Array
}

/** 计算桌面 ASAR 输入的稳定内容标识，路径和内容变化都会改变结果。 */
export function desktopBundleSha256(entries: readonly BundleEntry[]): string {
  const normalized = entries.map(entry => ({
    path: entry.path.replaceAll('\\', '/'),
    size: entry.content.byteLength,
    sha256: createHash('sha256').update(entry.content).digest('hex'),
  })).sort((left, right) => left.path.localeCompare(right.path))
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}
