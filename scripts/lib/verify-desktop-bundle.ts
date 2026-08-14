import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readDesktopBundleIdentity } from './desktop-bundle.js'

/**
 * 拒绝为与当前编译 bundle 不一致的运行时身份生成安装器。
 * @param projectRoot - 桌面仓库绝对根目录。
 * @param runtimeRoot - 已暂存运行时绝对根目录。
 */
export async function verifyDesktopBundleMatchesRuntime(projectRoot: string, runtimeRoot: string): Promise<void> {
  const raw = JSON.parse(await readFile(resolve(runtimeRoot, 'runtime-manifest.json'), 'utf8')) as Record<string, unknown>
  const resources = raw.resources
  if (typeof resources !== 'object' || resources === null || Array.isArray(resources)) {
    throw new Error('运行时清单缺少桌面 bundle 身份。')
  }
  const expected = (resources as Record<string, unknown>).desktopBundleSha256
  if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/u.test(expected)) {
    throw new Error('运行时清单的桌面 bundle 身份无效。')
  }
  const actual = await readDesktopBundleIdentity(projectRoot)
  if (actual !== expected) {
    throw new Error('当前编译桌面 bundle 与不可变候选身份不一致；请重新运行 package:win。')
  }
}
