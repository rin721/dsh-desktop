import { extractFile, listPackage } from '@electron/asar'
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { desktopBundleSha256 } from '../src/shared/bundle-identity.js'
import { readProductConfig } from '../src/shared/product-config.js'
import { loadVerifiedRuntimeLayout } from '../src/supervisor/runtime-layout.js'
import { pathExists, projectRoot } from './lib/project.js'
import { verifyRuntimeFileIndex } from './lib/runtime-index.js'
import { candidatePaths } from './lib/artifacts.js'

const appRoot = (await candidatePaths()).appRoot
const executable = resolve(appRoot, 'dsh-desktop.exe')
const resources = resolve(appRoot, 'resources')
const archive = resolve(resources, 'app.asar')
const runtime = resolve(resources, '.runtime')
for (const path of [executable, archive, resolve(runtime, 'runtime-manifest.json')]) {
  if (!await pathExists(path)) throw new Error(`打包审计缺少必需文件：${path}`)
}

const entries = listPackage(archive, { isPack: false })
for (const required of [
  '\\package.json',
  '\\desktop.config.json',
  '\\dist\\main\\index.js',
  '\\dist\\renderer\\startup.html',
  '\\dist\\renderer\\failure.html',
  '\\dist\\renderer\\icons\\png\\app-icon-192.png',
  '\\dist\\renderer\\icons\\png\\app-icon-256.png',
]) {
  if (!entries.includes(required)) throw new Error(`app.asar 缺少必需入口：${required}`)
}
for (const entry of entries) {
  if (entry.includes('node_modules') || entry.endsWith('.map') || /^\\(?:src|scripts|native|deepseek-harness)(?:\\|$)/u.test(entry)) {
    throw new Error(`app.asar 包含禁止的开发资源：${entry}`)
  }
}
const allowedPackagedIcons = new Set([
  '\\dist\\renderer\\icons',
  '\\dist\\renderer\\icons\\png',
  '\\dist\\renderer\\icons\\png\\app-icon-192.png',
  '\\dist\\renderer\\icons\\png\\app-icon-256.png',
])
for (const entry of entries.filter(value => value.startsWith('\\dist\\renderer\\icons'))) {
  if (!allowedPackagedIcons.has(entry)) throw new Error(`app.asar 包含非运行时图标资源：${entry}`)
}
const packagedManifest = JSON.parse(extractFile(archive, 'package.json').toString('utf8')) as Record<string, unknown>
for (const forbidden of ['config', 'dependencies', 'devDependencies', 'optionalDependencies']) {
  if (forbidden in packagedManifest) throw new Error(`打包 package.json 不得包含 ${forbidden}。`)
}
const runtimeManifest = JSON.parse(await readFile(resolve(runtime, 'runtime-manifest.json'), 'utf8')) as {
  resources?: { desktopBundleSha256?: unknown }
}
const bundleEntries = entries
  .filter(entry => entry === '\\desktop.config.json' || entry.startsWith('\\dist\\'))
  .filter(entry => !entries.some(other => other.startsWith(`${entry}\\`)))
  .map(entry => ({ path: entry.slice(1).replaceAll('\\', '/'), content: extractFile(archive, entry.slice(1)) }))
const packagedBundleSha256 = desktopBundleSha256(bundleEntries)
if (runtimeManifest.resources?.desktopBundleSha256 !== packagedBundleSha256) {
  throw new Error('打包后的桌面 bundle 与构建标识不一致。')
}

const wire = await getCurrentFuseWire(executable)
const expectedFuses = [
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
] as const
for (const [option, expected] of expectedFuses) {
  if (wire[option] !== expected) throw new Error(`Electron fuse ${String(option)} 未达到预期状态。`)
}

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const layout = await loadVerifiedRuntimeLayout(runtime, config)
const index = await verifyRuntimeFileIndex(runtime)
if (await pathExists(resolve(runtime, 'harness', 'node_modules', '.pnpm'))) {
  throw new Error('打包运行时不得包含 pnpm 虚拟存储。')
}
for (const required of [
  resolve(appRoot, 'LICENSE'),
  resolve(appRoot, 'LICENSES.chromium.html'),
  resolve(runtime, 'third-party-components.json'),
]) {
  if (!await pathExists(required)) throw new Error(`打包合规声明缺少必需文件：${required}`)
}
console.log(`打包审计通过：Harness ${layout.identity.harnessVersion}，Node.js ${layout.identity.nodeVersion}，${index.files.length} 个运行时文件，buildId=${layout.identity.buildId}`)
