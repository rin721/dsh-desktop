import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { projectRoot } from './lib/project.js'
import { runPnpm } from './lib/process.js'
import { readPublishedHarness } from './lib/npm-registry.js'

const requested = process.argv.slice(2).find(argument => argument !== '--')
if (requested === undefined || !/^[0-9A-Za-z.-]+$/u.test(requested)) throw new Error('必须提供安全的精确 Harness 版本。')
const published = await readPublishedHarness(requested)
if (published.version !== requested) throw new Error('npm 返回版本与请求的精确版本不一致。')

const configPath = resolve(projectRoot, 'desktop.config.json')
const runtimePackagePath = resolve(projectRoot, 'packages', 'harness-runtime', 'package.json')
const lockfilePath = resolve(projectRoot, 'pnpm-lock.yaml')
const originals = new Map<string, string>(await Promise.all([configPath, runtimePackagePath, lockfilePath].map(async path => [path, await readFile(path, 'utf8')] as const)))
const config = JSON.parse(originals.get(configPath) ?? '') as { harness?: Record<string, unknown> }
const runtimePackage = JSON.parse(originals.get(runtimePackagePath) ?? '') as { dependencies?: Record<string, unknown> }
if (config.harness === undefined || runtimePackage.dependencies === undefined) throw new Error('版本来源文件缺少 Harness 声明。')
if (config.harness.version === requested) {
  console.log(`Harness 已固定为 ${requested}，候选文件保持不变。`)
} else {
  config.harness.version = published.version
  config.harness.integrity = published.integrity
  config.harness.tarball = published.tarball
  runtimePackage.dependencies['@deepseek-ai/dsh'] = published.version

  try {
    await replaceFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
    await replaceFile(runtimePackagePath, `${JSON.stringify(runtimePackage, null, 2)}\n`)
    await runPnpm(['install', '--lockfile-only'], projectRoot)
    console.log(`Harness 更新候选已生成：${published.version}`)
  } catch (error) {
    for (const [path, content] of originals) await replaceFile(path, content)
    throw error
  }
}

async function replaceFile(path: string, content: string): Promise<void> {
  const temporary = resolve(dirname(path), `.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
