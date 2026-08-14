import { readFile, readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { desktopBundleSha256 } from '../../src/shared/bundle-identity.js'

/**
 * 重新计算进入桌面 ASAR 的编译产物与产品配置身份。
 * @param projectRoot - 桌面仓库绝对根目录。
 * @returns 与运行时清单使用相同算法的 SHA-256。
 */
export async function readDesktopBundleIdentity(projectRoot: string): Promise<string> {
  const dist = resolve(projectRoot, 'dist')
  const paths: string[] = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && !entry.name.endsWith('.map')) paths.push(path)
      else if (entry.isSymbolicLink()) throw new Error(`桌面 bundle 不得包含符号链接：${path}`)
    }
  }
  await visit(dist)
  const entries = await Promise.all(paths.map(async path => ({
    path: `dist/${relative(dist, path).split(sep).join('/')}`,
    content: await readFile(path),
  })))
  entries.push({
    path: 'desktop.config.json',
    content: await readFile(resolve(projectRoot, 'desktop.config.json')),
  })
  return desktopBundleSha256(entries)
}
