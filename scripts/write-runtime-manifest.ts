import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { sha256File } from '../src/shared/hash.js'
import { readProductConfig } from '../src/shared/product-config.js'
import { pathExists, projectRoot, runtimeRoot } from './lib/project.js'
import { readDesktopBundleIdentity } from './lib/desktop-bundle.js'

const execFileAsync = promisify(execFile)
const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const desktopPackage = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')) as { version?: unknown; devDependencies?: Record<string, unknown> }
if (desktopPackage.devDependencies?.electron !== config.electron.version) {
  throw new Error(`Electron 依赖必须精确等于 ${config.electron.version}。`)
}

const nodeRoot = resolve(runtimeRoot, 'node', config.node.archive.slice(0, -4))
const nodeExecutable = resolve(nodeRoot, 'node.exe')
const harnessRoot = resolve(runtimeRoot, 'harness', 'node_modules', '@deepseek-ai', 'dsh')
const harnessPackageJson = resolve(harnessRoot, 'package.json')
const harnessBin = resolve(harnessRoot, config.harness.bin)
const bootstrapSource = resolve(projectRoot, 'dist', 'bootstrap', 'supervisor-bootstrap.js')
const protocolSource = resolve(projectRoot, 'dist', 'bootstrap', 'protocol.js')
const bootstrapRoot = resolve(runtimeRoot, 'bootstrap')
const bootstrap = resolve(bootstrapRoot, 'supervisor-bootstrap.js')
const protocol = resolve(bootstrapRoot, 'protocol.js')
const launcher = resolve(runtimeRoot, 'launcher', 'dsh-desktop-launcher.exe')
const thirdPartyComponents = resolve(runtimeRoot, 'third-party-components.json')
const runtimeFiles = resolve(runtimeRoot, 'runtime-files.json')

for (const path of [nodeExecutable, harnessPackageJson, harnessBin, bootstrapSource, protocolSource, launcher, thirdPartyComponents, runtimeFiles]) {
  if (!await pathExists(path)) throw new Error(`运行时清单缺少必需文件：${path}`)
}

const { stdout } = await execFileAsync(nodeExecutable, ['--version'], {
  windowsHide: true,
  timeout: 10000,
})
if (stdout.trim() !== `v${config.node.version}`) {
  throw new Error(`暂存 Node.js 报告 ${stdout.trim()}，预期 v${config.node.version}。`)
}

const harnessPackage = JSON.parse(await readFile(harnessPackageJson, 'utf8')) as { version?: unknown }
if (harnessPackage.version !== config.harness.version) {
  throw new Error(`暂存 Harness 报告 ${String(harnessPackage.version)}，预期 ${config.harness.version}。`)
}

const resources = {
  nodeExecutableSha256: await sha256File(nodeExecutable),
  harnessPackageJsonSha256: await sha256File(harnessPackageJson),
  harnessBinSha256: await sha256File(harnessBin),
  bootstrapSha256: await sha256File(bootstrap),
  protocolSha256: await sha256File(protocol),
  launcherSha256: await sha256File(launcher),
  thirdPartyComponentsSha256: await sha256File(thirdPartyComponents),
  runtimeFilesSha256: await sha256File(runtimeFiles),
  desktopBundleSha256: await readDesktopBundleIdentity(projectRoot),
}
const identity = {
  schemaVersion: 2,
  desktopVersion: String(desktopPackage.version),
  harnessVersion: config.harness.version,
  nodeVersion: config.node.version,
  electronVersion: config.electron.version,
  electronWin32X64ZipSha256: config.electron.win32X64ZipSha256,
  electronArchiveUrl: `${config.electron.baseUrl}/${config.electron.archive}`,
  harnessSource: {
    package: config.harness.package,
    integrity: config.harness.integrity,
    tarball: config.harness.tarball,
  },
  resources,
}
const buildId = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
const manifest = { ...identity, buildId }
await writeFile(resolve(runtimeRoot, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Runtime manifest written: buildId=${buildId}`)
