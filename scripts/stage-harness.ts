import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readProductConfig } from '../src/shared/product-config.js'
import { pathExists, projectRoot, removeManagedPath, runtimeRoot } from './lib/project.js'
import { runPnpm } from './lib/process.js'

interface PackageManifest {
  version?: unknown
  dependencies?: Record<string, unknown>
}

async function manifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, 'utf8')) as PackageManifest
}

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const workspaceManifest = await manifest(resolve(projectRoot, 'packages', 'harness-runtime', 'package.json'))
if (workspaceManifest.dependencies?.[config.harness.package] !== config.harness.version) {
  throw new Error(`harness-runtime 必须精确依赖 ${config.harness.package}@${config.harness.version}。`)
}
const lockfile = await readFile(resolve(projectRoot, 'pnpm-lock.yaml'), 'utf8')
for (const expected of [
  `'${config.harness.package}@${config.harness.version}':`,
  `integrity: ${config.harness.integrity}`,
  `tarball: ${config.harness.tarball}`,
]) {
  if (!lockfile.includes(expected)) throw new Error(`锁文件缺少固定 Harness 来源：${expected}`)
}

const target = resolve(runtimeRoot, 'harness')
await removeManagedPath(target)
await runPnpm([
  '--filter',
  '@dsh-desktop/harness-runtime',
  '--prod',
  'deploy',
  target,
], projectRoot)

const deployedNodeModules = resolve(target, 'node_modules')
await assertNoLinksOutsideVirtualStore(deployedNodeModules)
for (const redundant of [
  resolve(deployedNodeModules, '.pnpm'),
  resolve(deployedNodeModules, '.modules.yaml'),
  resolve(deployedNodeModules, '.pnpm-workspace-state-v1.json'),
]) {
  if (await pathExists(redundant)) await removeManagedPath(redundant)
}

const deployedPackageRoot = resolve(target, 'node_modules', '@deepseek-ai', 'dsh')
const deployedManifest = await manifest(resolve(deployedPackageRoot, 'package.json'))
if (deployedManifest.version !== config.harness.version) {
  throw new Error(`部署后的 Harness 版本为 ${String(deployedManifest.version)}，预期 ${config.harness.version}。`)
}
const bin = resolve(deployedPackageRoot, config.harness.bin)
if (!await pathExists(bin)) throw new Error(`部署后的 Harness 缺少入口：${bin}`)

console.log(`Harness runtime staged: ${config.harness.package}@${config.harness.version}`)

async function assertNoLinksOutsideVirtualStore(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === resolve(target, 'node_modules') && entry.name === '.pnpm') continue
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`部署闭包仍依赖 pnpm 链接，不能安全移除虚拟存储：${path}`)
    }
    if (entry.isDirectory()) await assertNoLinksOutsideVirtualStore(path)
  }
}
