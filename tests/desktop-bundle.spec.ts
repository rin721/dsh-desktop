import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readDesktopBundleIdentity } from '../scripts/lib/desktop-bundle.js'
import { removeOwnedPath } from '../scripts/lib/project.js'
import { verifyDesktopBundleMatchesRuntime } from '../scripts/lib/verify-desktop-bundle.js'

const owner = resolve(tmpdir(), 'dsh-desktop-bundle-identity-tests')
const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await removeOwnedPath(root, owner)
})

describe('桌面 bundle 与候选身份', () => {
  it('接受匹配身份并拒绝编译产物漂移', async () => {
    await mkdir(owner, { recursive: true })
    const project = await mkdtemp(resolve(owner, 'case-'))
    roots.push(project)
    const runtime = resolve(project, '.runtime')
    const main = resolve(project, 'dist', 'main', 'index.js')
    await mkdir(resolve(project, 'dist', 'main'), { recursive: true })
    await mkdir(runtime)
    await writeFile(main, 'export const value = 1\n')
    await writeFile(resolve(project, 'desktop.config.json'), '{"name":"test"}\n')
    const identity = await readDesktopBundleIdentity(project)
    await writeFile(resolve(runtime, 'runtime-manifest.json'), JSON.stringify({
      resources: { desktopBundleSha256: identity },
    }))

    await expect(verifyDesktopBundleMatchesRuntime(project, runtime)).resolves.toBeUndefined()
    await writeFile(main, 'export const value = 2\n')
    await expect(verifyDesktopBundleMatchesRuntime(project, runtime)).rejects.toThrow('请重新运行 package:win')
  })
})
