import { readFile } from 'node:fs/promises'

/** 桌面发行物固定的产品、运行时和超时配置。 */
export interface ProductConfig {
  schemaVersion: 1
  harness: {
    package: '@deepseek-ai/dsh'
    version: string
    bin: string
    integrity: `sha512-${string}`
    tarball: string
  }
  node: {
    version: string
    platform: 'win'
    arch: 'x64'
    archive: string
    baseUrl: string
  }
  electron: {
    version: string
    archive: string
    baseUrl: string
    win32X64ZipSha256: string
  }
  startup: {
    readinessTimeoutMs: number
    shutdownTimeoutMs: number
    maxDiagnosticBytes: number
  }
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${subject} 必须是对象。`)
  }
  return value as Record<string, unknown>
}

function exactString(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${subject} 必须是非空字符串。`)
  }
  return value
}

function positiveInteger(value: unknown, subject: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${subject} 必须是正整数。`)
  }
  return value as number
}

/**
 * 从受版本控制的 JSON 文件读取并验证桌面产品配置。
 * @param path - 配置文件的绝对路径。
 * @returns 已验证且可安全用于构建和运行时路径选择的配置。
 */
export async function readProductConfig(path: string): Promise<ProductConfig> {
  const raw = object(JSON.parse(await readFile(path, 'utf8')) as unknown, 'desktop.config.json')
  if (raw.schemaVersion !== 1) throw new TypeError('desktop.config.json.schemaVersion 必须是 1。')

  const harness = object(raw.harness, 'desktop.config.json.harness')
  const node = object(raw.node, 'desktop.config.json.node')
  const electron = object(raw.electron, 'desktop.config.json.electron')
  const startup = object(raw.startup, 'desktop.config.json.startup')

  const harnessPackage = exactString(harness.package, 'desktop.config.json.harness.package')
  if (harnessPackage !== '@deepseek-ai/dsh') {
    throw new TypeError('desktop.config.json.harness.package 必须是 @deepseek-ai/dsh。')
  }
  const nodePlatform = exactString(node.platform, 'desktop.config.json.node.platform')
  const nodeArch = exactString(node.arch, 'desktop.config.json.node.arch')
  if (nodePlatform !== 'win' || nodeArch !== 'x64') {
    throw new TypeError('首发运行时只接受 win/x64。')
  }
  const nodeVersion = exactString(node.version, 'desktop.config.json.node.version')
  const nodeArchive = exactString(node.archive, 'desktop.config.json.node.archive')
  const nodeBaseUrl = exactString(node.baseUrl, 'desktop.config.json.node.baseUrl')
  if (nodeArchive !== `node-v${nodeVersion}-win-x64.zip`) {
    throw new TypeError('desktop.config.json.node.archive 与固定 Node.js 版本不一致。')
  }
  if (nodeBaseUrl !== `https://nodejs.org/dist/v${nodeVersion}`) {
    throw new TypeError('desktop.config.json.node.baseUrl 必须指向固定版本的 nodejs.org 官方发行目录。')
  }
  const harnessVersion = exactString(harness.version, 'desktop.config.json.harness.version')
  const harnessIntegrity = exactString(harness.integrity, 'desktop.config.json.harness.integrity')
  const harnessTarball = exactString(harness.tarball, 'desktop.config.json.harness.tarball')
  if (!harnessIntegrity.startsWith('sha512-')) {
    throw new TypeError('desktop.config.json.harness.integrity 必须是 sha512 SRI。')
  }
  if (harnessTarball !== `https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-${harnessVersion}.tgz`) {
    throw new TypeError('desktop.config.json.harness.tarball 必须指向精确版本的官方 npm 发行包。')
  }
  const electronSha256 = exactString(electron.win32X64ZipSha256, 'desktop.config.json.electron.win32X64ZipSha256')
  if (!/^[0-9a-f]{64}$/u.test(electronSha256)) {
    throw new TypeError('desktop.config.json.electron.win32X64ZipSha256 必须是小写 SHA-256。')
  }
  const electronVersion = exactString(electron.version, 'desktop.config.json.electron.version')
  const electronArchive = exactString(electron.archive, 'desktop.config.json.electron.archive')
  const electronBaseUrl = exactString(electron.baseUrl, 'desktop.config.json.electron.baseUrl')
  if (electronArchive !== `electron-v${electronVersion}-win32-x64.zip`) {
    throw new TypeError('desktop.config.json.electron.archive 与固定 Electron 版本不一致。')
  }
  if (electronBaseUrl !== `https://github.com/electron/electron/releases/download/v${electronVersion}`) {
    throw new TypeError('desktop.config.json.electron.baseUrl 必须指向固定版本的官方 GitHub 发行目录。')
  }

  return {
    schemaVersion: 1,
    harness: {
      package: '@deepseek-ai/dsh',
      version: harnessVersion,
      bin: exactString(harness.bin, 'desktop.config.json.harness.bin'),
      integrity: harnessIntegrity as `sha512-${string}`,
      tarball: harnessTarball,
    },
    node: {
      version: nodeVersion,
      platform: 'win',
      arch: 'x64',
      archive: nodeArchive,
      baseUrl: nodeBaseUrl,
    },
    electron: {
      version: electronVersion,
      archive: electronArchive,
      baseUrl: electronBaseUrl,
      win32X64ZipSha256: electronSha256,
    },
    startup: {
      readinessTimeoutMs: positiveInteger(startup.readinessTimeoutMs, 'desktop.config.json.startup.readinessTimeoutMs'),
      shutdownTimeoutMs: positiveInteger(startup.shutdownTimeoutMs, 'desktop.config.json.startup.shutdownTimeoutMs'),
      maxDiagnosticBytes: positiveInteger(startup.maxDiagnosticBytes, 'desktop.config.json.startup.maxDiagnosticBytes'),
    },
  }
}
