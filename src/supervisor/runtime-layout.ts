import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { sha256File } from '../shared/hash.js'
import type { ProductConfig } from '../shared/product-config.js'

/** 已校验资源清单提供的桌面运行时身份。 */
export interface RuntimeIdentity {
  desktopVersion: string
  harnessVersion: string
  nodeVersion: string
  electronVersion: string
  buildId: string
}

/** 监管器启动进程所需的已校验绝对路径。 */
export interface VerifiedRuntimeLayout {
  identity: RuntimeIdentity
  launcherPath: string
  nodePath: string
  bootstrapPath: string
  harnessBinPath: string
}

interface RuntimeManifest extends RuntimeIdentity {
  schemaVersion: 2
  electronWin32X64ZipSha256: string
  electronArchiveUrl: string
  harnessSource: {
    package: '@deepseek-ai/dsh'
    integrity: string
    tarball: string
  }
  resources: {
    nodeExecutableSha256: string
    harnessPackageJsonSha256: string
    harnessBinSha256: string
    bootstrapSha256: string
    protocolSha256: string
    launcherSha256: string
    thirdPartyComponentsSha256: string
    runtimeFilesSha256: string
    desktopBundleSha256: string
  }
}

function string(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${subject} 必须是非空字符串。`)
  return value
}

function manifest(value: unknown): RuntimeManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('runtime manifest 必须是对象。')
  const root = value as Record<string, unknown>
  if (root.schemaVersion !== 2) throw new TypeError('runtime manifest schemaVersion 必须是 2。')
  if (typeof root.resources !== 'object' || root.resources === null || Array.isArray(root.resources)) {
    throw new TypeError('runtime manifest resources 必须是对象。')
  }
  if (typeof root.harnessSource !== 'object' || root.harnessSource === null || Array.isArray(root.harnessSource)) {
    throw new TypeError('runtime manifest harnessSource 必须是对象。')
  }
  const resources = root.resources as Record<string, unknown>
  const harnessSource = root.harnessSource as Record<string, unknown>
  const sourcePackage = string(harnessSource.package, 'runtime manifest harnessSource.package')
  if (sourcePackage !== '@deepseek-ai/dsh') throw new TypeError('runtime manifest Harness 来源包无效。')
  return {
    schemaVersion: 2,
    desktopVersion: string(root.desktopVersion, 'runtime manifest desktopVersion'),
    harnessVersion: string(root.harnessVersion, 'runtime manifest harnessVersion'),
    nodeVersion: string(root.nodeVersion, 'runtime manifest nodeVersion'),
    electronVersion: string(root.electronVersion, 'runtime manifest electronVersion'),
    electronWin32X64ZipSha256: string(root.electronWin32X64ZipSha256, 'runtime manifest electronWin32X64ZipSha256'),
    electronArchiveUrl: string(root.electronArchiveUrl, 'runtime manifest electronArchiveUrl'),
    buildId: string(root.buildId, 'runtime manifest buildId'),
    harnessSource: {
      package: '@deepseek-ai/dsh',
      integrity: string(harnessSource.integrity, 'runtime manifest harnessSource.integrity'),
      tarball: string(harnessSource.tarball, 'runtime manifest harnessSource.tarball'),
    },
    resources: {
      nodeExecutableSha256: string(resources.nodeExecutableSha256, 'runtime manifest nodeExecutableSha256'),
      harnessPackageJsonSha256: string(resources.harnessPackageJsonSha256, 'runtime manifest harnessPackageJsonSha256'),
      harnessBinSha256: string(resources.harnessBinSha256, 'runtime manifest harnessBinSha256'),
      bootstrapSha256: string(resources.bootstrapSha256, 'runtime manifest bootstrapSha256'),
      protocolSha256: string(resources.protocolSha256, 'runtime manifest protocolSha256'),
      launcherSha256: string(resources.launcherSha256, 'runtime manifest launcherSha256'),
      thirdPartyComponentsSha256: string(resources.thirdPartyComponentsSha256, 'runtime manifest thirdPartyComponentsSha256'),
      runtimeFilesSha256: string(resources.runtimeFilesSha256, 'runtime manifest runtimeFilesSha256'),
      desktopBundleSha256: string(resources.desktopBundleSha256, 'runtime manifest desktopBundleSha256'),
    },
  }
}

async function verifyHash(path: string, expected: string, subject: string): Promise<void> {
  const actual = await sha256File(path)
  if (actual !== expected) throw new Error(`${subject} SHA-256 不匹配。`)
}

/**
 * 读取运行时清单并校验所有启动关键文件，失败时不得创建子进程。
 * @param runtimeBase - 开发仓库或安装包 `resources/.runtime` 的绝对路径。
 * @param config - 已验证的桌面产品配置。
 * @returns 仅包含已通过版本与哈希校验的路径和身份。
 */
export async function loadVerifiedRuntimeLayout(
  runtimeBase: string,
  config: ProductConfig,
): Promise<VerifiedRuntimeLayout> {
  const runtimeManifest = manifest(JSON.parse(await readFile(resolve(runtimeBase, 'runtime-manifest.json'), 'utf8')) as unknown)
  if (runtimeManifest.harnessVersion !== config.harness.version
    || runtimeManifest.nodeVersion !== config.node.version
    || runtimeManifest.electronVersion !== config.electron.version
    || runtimeManifest.electronWin32X64ZipSha256 !== config.electron.win32X64ZipSha256
    || runtimeManifest.electronArchiveUrl !== `${config.electron.baseUrl}/${config.electron.archive}`
    || runtimeManifest.harnessSource.integrity !== config.harness.integrity
    || runtimeManifest.harnessSource.tarball !== config.harness.tarball) {
    throw new Error('runtime manifest 与 desktop.config.json 的固定版本不一致。')
  }

  const nodePath = resolve(runtimeBase, 'node', config.node.archive.slice(0, -4), 'node.exe')
  const harnessRoot = resolve(runtimeBase, 'harness', 'node_modules', '@deepseek-ai', 'dsh')
  const harnessPackageJson = resolve(harnessRoot, 'package.json')
  const harnessBinPath = resolve(harnessRoot, config.harness.bin)
  const bootstrapPath = resolve(runtimeBase, 'bootstrap', 'supervisor-bootstrap.js')
  const protocolPath = resolve(runtimeBase, 'bootstrap', 'protocol.js')
  const launcherPath = resolve(runtimeBase, 'launcher', 'dsh-desktop-launcher.exe')
  const thirdPartyComponentsPath = resolve(runtimeBase, 'third-party-components.json')
  const runtimeFilesPath = resolve(runtimeBase, 'runtime-files.json')

  await Promise.all([
    verifyHash(nodePath, runtimeManifest.resources.nodeExecutableSha256, 'Node.js'),
    verifyHash(harnessPackageJson, runtimeManifest.resources.harnessPackageJsonSha256, 'Harness package.json'),
    verifyHash(harnessBinPath, runtimeManifest.resources.harnessBinSha256, 'Harness bin'),
    verifyHash(bootstrapPath, runtimeManifest.resources.bootstrapSha256, 'supervisor bootstrap'),
    verifyHash(protocolPath, runtimeManifest.resources.protocolSha256, 'supervisor protocol'),
    verifyHash(launcherPath, runtimeManifest.resources.launcherSha256, 'Windows launcher'),
    verifyHash(thirdPartyComponentsPath, runtimeManifest.resources.thirdPartyComponentsSha256, '第三方组件声明'),
    verifyHash(runtimeFilesPath, runtimeManifest.resources.runtimeFilesSha256, '完整运行时索引'),
  ])

  return {
    identity: {
      desktopVersion: runtimeManifest.desktopVersion,
      harnessVersion: runtimeManifest.harnessVersion,
      nodeVersion: runtimeManifest.nodeVersion,
      electronVersion: runtimeManifest.electronVersion,
      buildId: runtimeManifest.buildId,
    },
    launcherPath,
    nodePath,
    bootstrapPath,
    harnessBinPath,
  }
}
