import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses'
import { packager } from '@electron/packager'
import { readProductConfig } from '../src/shared/product-config.js'
import { loadVerifiedRuntimeLayout } from '../src/supervisor/runtime-layout.js'
import { buildCacheRoot, pathExists, projectRoot, runtimeRoot } from './lib/project.js'
import { appStageRoot } from './lib/stage.js'
import { candidatePaths } from './lib/artifacts.js'

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const candidate = await candidatePaths()
if (await pathExists(candidate.appRoot)) {
  throw new Error(`候选应用目录已存在，拒绝覆盖回滚证据：${candidate.appRoot}`)
}
const outputPaths = await packager({
  dir: appStageRoot,
  out: candidate.candidateRoot,
  overwrite: false,
  platform: 'win32',
  arch: 'x64',
  electronVersion: config.electron.version,
  electronZipDir: resolve(buildCacheRoot, 'electron'),
  asar: true,
  executableName: 'dsh-desktop',
  prune: false,
  afterCopy: [((buildPath, _electronVersion, _platform, _arch, callback) => {
    void sanitizePackagedManifest(buildPath).then(() => callback(), error => callback(error as Error))
  })],
})

if (outputPaths.length !== 1) throw new Error(`Electron Packager 返回了 ${outputPaths.length} 个输出目录。`)
const outputPath = outputPaths[0]
if (outputPath === undefined) throw new Error('Electron Packager 未返回 Windows x64 输出目录。')
if (resolve(outputPath) !== candidate.appRoot) throw new Error(`Electron Packager 返回了非预期候选目录：${outputPath}`)
const executable = resolve(outputPath, 'dsh-desktop.exe')
if (!await pathExists(executable)) throw new Error(`打包结果缺少桌面可执行文件：${executable}`)

await flipFuses(executable, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
})

const packagedRuntime = resolve(outputPath, 'resources', '.runtime')
if (await pathExists(packagedRuntime)) throw new Error(`拒绝覆盖已存在的运行时目录：${packagedRuntime}`)
await robocopyRuntime(runtimeRoot, packagedRuntime)
await loadVerifiedRuntimeLayout(packagedRuntime, config)
console.log(`Windows x64 应用目录已生成并验证：${outputPath}`)

async function sanitizePackagedManifest(buildPath: string): Promise<void> {
  const path = resolve(buildPath, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  delete manifest.config
  delete manifest.dependencies
  delete manifest.devDependencies
  delete manifest.optionalDependencies
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

async function robocopyRuntime(source: string, target: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('robocopy.exe', [
      source,
      target,
      '/E',
      '/COPY:DAT',
      '/DCOPY:DAT',
      '/R:1',
      '/W:1',
      '/XJ',
      '/NFL',
      '/NDL',
      '/NJH',
      '/NJS',
      '/NP',
    ], {
      cwd: projectRoot,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code !== null && code >= 0 && code <= 7) resolvePromise()
      else reject(new Error(`robocopy 复制运行时失败：code=${String(code)} signal=${String(signal)}`))
    })
  })
}
