import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readProductConfig } from '../src/shared/product-config.js'

describe('产品版本来源', () => {
  it('配置、桌面依赖和 Harness runtime 声明保持精确一致', async () => {
    const root = resolve(import.meta.dirname, '..')
    const config = await readProductConfig(resolve(root, 'desktop.config.json'))
    const desktop = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
      devDependencies?: Record<string, unknown>
    }
    const runtime = JSON.parse(await readFile(resolve(root, 'packages', 'harness-runtime', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, unknown>
    }
    const lockfile = await readFile(resolve(root, 'pnpm-lock.yaml'), 'utf8')

    expect(desktop.devDependencies?.electron).toBe(config.electron.version)
    expect(runtime.dependencies?.['@deepseek-ai/dsh']).toBe(config.harness.version)
    expect(lockfile).toContain(`'@deepseek-ai/dsh@${config.harness.version}':`)
    expect(lockfile).toContain(`integrity: ${config.harness.integrity}`)
    expect(lockfile).toContain(`tarball: ${config.harness.tarball}`)
    expect(config.node.archive).toBe(`node-v${config.node.version}-win-x64.zip`)
    expect(config.electron.win32X64ZipSha256).toMatch(/^[0-9a-f]{64}$/u)
  })
})
