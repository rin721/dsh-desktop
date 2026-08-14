import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { sanitizedAcceptanceEnvironment } from './lib/acceptance-environment.js'
import { candidatePaths } from './lib/artifacts.js'
import { pathExists, removeEphemeralTree } from './lib/project.js'

if (process.platform !== 'win32') throw new Error('安装器 smoke 只支持 Windows。')
const allowResidue = process.argv.includes('--allow-squirrel-residue')
const candidate = await candidatePaths()
const setup = resolve(candidate.makeRoot, `DSH Desktop-${candidate.desktopVersion} Setup.exe`)
if (!await pathExists(setup)) throw new Error(`缺少当前候选安装器：${setup}`)
const localAppData = process.env.LOCALAPPDATA
const roamingAppData = process.env.APPDATA
if (localAppData === undefined || roamingAppData === undefined) throw new Error('缺少 Windows 用户目录环境。')
const installRoot = resolve(localAppData, 'DshDesktop')
if (await pathExists(installRoot)) throw new Error(`安装器 smoke 拒绝覆盖已有安装：${installRoot}`)

const acceptanceOwner = resolve(tmpdir(), 'dsh-desktop-installer-smoke')
const acceptanceRoot = resolve(acceptanceOwner, `${candidate.buildId}-${process.pid}`)
const dshHome = resolve(acceptanceRoot, 'DSH_HOME')
const workspace = resolve(acceptanceRoot, '工作 目录')
await mkdir(dshHome, { recursive: true })
await mkdir(workspace, { recursive: true })
const log = resolve(roamingAppData, 'DSH Desktop', 'logs', 'dsh-desktop.log')
const originalLogLength = await textLength(log)
const acceptanceEnvironment = sanitizedAcceptanceEnvironment()
let succeeded = false

try {
  await runAndWait(setup, ['--silent'], acceptanceEnvironment, 180000)
  const executable = resolve(installRoot, `app-${candidate.desktopVersion}`, 'dsh-desktop.exe')
  if (!await pathExists(executable)) throw new Error(`静默安装缺少版本化入口：${executable}`)

  const main = spawn(executable, [], {
    env: { ...acceptanceEnvironment, DSH_HOME: dshHome, DSH_DESKTOP_WORKSPACE: workspace },
    shell: false,
    stdio: 'ignore',
    windowsHide: false,
  })
  if (main.pid === undefined) throw new Error('已安装应用没有返回主进程 PID。')
  await waitForReadyLog(log, originalLogLength, candidate.buildId, 120000)
  const owned = await inspectOwnedProcesses(installRoot)
  if (!owned.some(entry => entry.name === 'dsh-desktop-launcher.exe')) throw new Error('已安装进程链缺少 Windows launcher。')
  const bundledNode = owned.find(entry => entry.name === 'node.exe' && entry.executablePath.toLocaleLowerCase('en-US').includes('resources\\.runtime\\node\\'))
  if (bundledNode === undefined) {
    throw new Error('已安装进程链没有使用包内 Node.js。')
  }
  const listeners = await inspectListeningAddresses(bundledNode.processId)
  if (!listeners.includes('127.0.0.1')) throw new Error('包内 Node.js 没有监听 IPv4 回环地址。')
  const nonLoopback = listeners.filter(address => address !== '127.0.0.1' && address !== '::1')
  if (nonLoopback.length > 0) throw new Error(`包内 Node.js 存在非回环监听：${nonLoopback.join(', ')}`)

  await runAndWait(executable, [], acceptanceEnvironment, 15000)
  await requestWindowClose(main.pid)
  await waitForExit(main, 30000)
  await waitUntil(async () => (await inspectOwnedProcesses(installRoot)).length === 0, 30000, '正常关窗后仍有安装目录进程。')

  const update = resolve(installRoot, 'Update.exe')
  await runAndWait(update, ['--uninstall', '-s'], acceptanceEnvironment, 120000)
  await waitUntil(async () => !await pathExists(resolve(installRoot, 'dsh-desktop.exe')), 30000, '卸载后执行入口仍存在。')
  const residue = await listResidue(installRoot)
  const shortcut = resolve(await capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Environment]::GetFolderPath("Desktop")'], 30000).then(value => value.trim()), 'DSH Desktop.lnk')
  if (await pathExists(shortcut)) throw new Error('卸载后桌面快捷方式仍存在。')
  if (!await pathExists(dshHome)) throw new Error('卸载器错误删除了隔离 DSH_HOME。')
  if (residue.length > 0 && !allowResidue) throw new Error(`卸载后仍有 ${residue.length} 个残留路径。`)

  const report = {
    schemaVersion: 1,
    desktopVersion: candidate.desktopVersion,
    buildId: candidate.buildId,
    installedRuntimeReady: true,
    singleInstance: true,
    bundledNode: true,
    loopbackOnly: true,
    listeningAddresses: listeners,
    gracefulExitWithoutOwnedProcesses: true,
    userStatePreserved: true,
    cleanUninstall: residue.length === 0,
    residue: residue.map(path => basename(path)),
  }
  await writeFile(resolve(candidate.makeRoot, 'installer-smoke.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`安装器 smoke 通过；卸载残留 ${residue.length} 项。`)
  succeeded = true
} finally {
  if (succeeded) await removeEphemeralTree(acceptanceRoot, acceptanceOwner)
  else console.error(`安装器 smoke 诊断目录已保留：${acceptanceRoot}`)
}

interface OwnedProcess {
  name: string
  executablePath: string
  processId: number
}

async function inspectOwnedProcesses(installRoot: string): Promise<OwnedProcess[]> {
  const script = '$root=$args[0]; $prefix=Join-Path $root "*"; @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like $prefix } | Select-Object Name,ExecutablePath,ProcessId) | ConvertTo-Json -Compress'
  const output = await capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script, installRoot], 30000)
  if (output.trim().length === 0) return []
  const parsed = JSON.parse(output) as { Name?: unknown; ExecutablePath?: unknown; ProcessId?: unknown } | Array<{ Name?: unknown; ExecutablePath?: unknown; ProcessId?: unknown }>
  return (Array.isArray(parsed) ? parsed : [parsed]).map(entry => {
    if (typeof entry.Name !== 'string' || typeof entry.ExecutablePath !== 'string' || typeof entry.ProcessId !== 'number' || !Number.isInteger(entry.ProcessId) || entry.ProcessId <= 0) {
      throw new Error('Windows 进程检查返回无效字段。')
    }
    return { name: entry.Name.toLocaleLowerCase('en-US'), executablePath: entry.ExecutablePath, processId: entry.ProcessId }
  })
}

async function inspectListeningAddresses(processId: number): Promise<string[]> {
  const script = '$pidValue=[int]$args[0]; @(Get-NetTCPConnection -OwningProcess $pidValue -State Listen -ErrorAction Stop | Select-Object -ExpandProperty LocalAddress -Unique) | ConvertTo-Json -Compress'
  const output = await capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script, String(processId)], 30000)
  if (output.trim().length === 0) return []
  const parsed = JSON.parse(output) as unknown
  const values = Array.isArray(parsed) ? parsed : [parsed]
  if (!values.every(value => typeof value === 'string')) throw new Error('Windows 监听地址检查返回无效字段。')
  return [...new Set(values)]
}

async function requestWindowClose(pid: number): Promise<void> {
  const script = '$process=Get-Process -Id ([int]$args[0]) -ErrorAction Stop; if (-not $process.CloseMainWindow()) { exit 2 }'
  await runAndWait('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script, String(pid)], process.env, 30000)
}

async function waitForReadyLog(path: string, offset: number, buildId: string, timeoutMs: number): Promise<void> {
  await waitUntil(async () => {
    if (!await pathExists(path)) return false
    const content = await readFile(path, 'utf8')
    return content.slice(offset).split(/\r?\n/u).some(line => line.includes('"event":"harness-ready"') && line.includes(`"buildId":"${buildId}"`))
  }, timeoutMs, '已安装应用未在时限内报告 Harness 就绪。')
}

async function listResidue(root: string): Promise<string[]> {
  if (!await pathExists(root)) return []
  const paths: string[] = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      paths.push(path)
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(path)
    }
  }
  await visit(root)
  return paths
}

async function textLength(path: string): Promise<number> {
  try {
    return (await readFile(path, 'utf8')).length
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
}

async function runAndWait(command: string, args: string[], environment: NodeJS.ProcessEnv, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { env: environment, shell: false, stdio: 'ignore', windowsHide: true })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`命令在 ${timeoutMs}ms 内未退出：${basename(command)}`))
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else reject(new Error(`命令失败：${basename(command)} code=${String(code)} signal=${String(signal)}`))
    })
  })
}

async function capture(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`进程检查在 ${timeoutMs}ms 内未完成。`))
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', code => {
      clearTimeout(timer)
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString('utf8'))
      else reject(new Error(`进程检查失败：${Buffer.concat(stderr).toString('utf8').trim()}`))
    })
  })
}

async function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('已安装主进程未在正常关窗后退出。')), timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolvePromise()
    })
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function waitUntil(predicate: () => Promise<boolean>, timeoutMs: number, message: string): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
  }
  throw new Error(message)
}
