import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as wait } from 'node:timers/promises'
import { readProductConfig } from '../src/shared/product-config.js'
import { projectRoot, removeManagedPath, runtimeRoot } from './lib/project.js'

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const launcher = resolve(runtimeRoot, 'launcher', 'dsh-desktop-launcher.exe')
const node = resolve(runtimeRoot, 'node', config.node.archive.slice(0, -4), 'node.exe')
const workingDirectory = resolve(runtimeRoot, `启动器 空格 ${String(process.pid)}`)
const expectedArgument = '参数 空格 \\"引号 尾\\'
const processTreeScript = resolve(workingDirectory, 'process-tree.cjs')
const parentHelperScript = resolve(workingDirectory, 'parent-helper.cjs')

await mkdir(workingDirectory, { recursive: false })
try {
  await writeTestScripts()
  await verifyUnicodeAndNormalExit()
  await verifyForcedTreeCleanup()
  await verifyParentDisappearance()
  console.log('Windows launcher 正常退出、超时强制清理、父进程消失、后代清理与 Unicode 冒烟通过。')
} finally {
  await removeManagedPath(workingDirectory)
}

async function verifyUnicodeAndNormalExit(): Promise<void> {
  const result = await runLauncher([
    '--parent-pid',
    String(process.pid),
    '--cwd',
    workingDirectory,
    '--',
    node,
    '-e',
    'process.stdout.write(JSON.stringify({ cwd: process.cwd(), argument: process.argv[1] }))',
    expectedArgument,
  ])
  const parsed = JSON.parse(result.stdout) as { cwd?: unknown; argument?: unknown }
  if (parsed.cwd !== workingDirectory || parsed.argument !== expectedArgument) {
    throw new Error(`Unicode/引号往返不一致：${JSON.stringify(parsed)}`)
  }
  if (result.code !== 0 || result.stderr.length !== 0) {
    throw new Error(`正常退出结果异常：code=${String(result.code)} stderr=${result.stderr}`)
  }
}

async function verifyForcedTreeCleanup(): Promise<void> {
  const marker = resolve(workingDirectory, 'forced-tree.json')
  const child = spawnLauncher([
    '--parent-pid', String(process.pid),
    '--cwd', workingDirectory,
    '--', node, processTreeScript, marker,
  ])
  try {
    const tree = await waitForTreeMarker(marker)
    child.kill()
    await waitForExit(child, 10_000)
    await waitForProcessesGone([tree.rootPid, tree.descendantPid], 10_000, '超时强制清理')
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
}

async function verifyParentDisappearance(): Promise<void> {
  const marker = resolve(workingDirectory, 'parent-tree.json')
  const helper = spawn(node, [parentHelperScript, launcher, workingDirectory, node, processTreeScript, marker], {
    cwd: workingDirectory,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const output = collectOutput(helper)
  const helperResult = await waitForExit(helper, 15_000)
  const streams = await output
  if (helperResult.code !== 0) {
    throw new Error(`父进程辅助程序失败：code=${String(helperResult.code)} stderr=${streams.stderr}`)
  }
  const tree = await waitForTreeMarker(marker)
  const helperReport = JSON.parse(streams.stdout) as { launcherPid?: unknown }
  if (!isPid(helperReport.launcherPid)) throw new Error('父进程辅助程序未报告有效 launcher PID。')
  await waitForProcessesGone(
    [helperReport.launcherPid, tree.rootPid, tree.descendantPid],
    10_000,
    '父进程消失清理',
  )
}

async function writeTestScripts(): Promise<void> {
  await writeFile(processTreeScript, String.raw`
const { spawn } = require('node:child_process')
const { writeFileSync } = require('node:fs')
const marker = process.argv[2]
const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  stdio: 'ignore',
  windowsHide: true,
})
writeFileSync(marker, JSON.stringify({ rootPid: process.pid, descendantPid: descendant.pid }))
setInterval(() => {}, 1000)
`, 'utf8')
  await writeFile(parentHelperScript, String.raw`
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const [launcher, cwd, node, treeScript, marker] = process.argv.slice(2)
const child = spawn(launcher, [
  '--parent-pid', String(process.pid), '--cwd', cwd, '--', node, treeScript, marker,
], { cwd, detached: false, stdio: 'ignore', windowsHide: true })
child.unref()
const deadline = Date.now() + 10000
const timer = setInterval(() => {
  if (existsSync(marker)) {
    clearInterval(timer)
    process.stdout.write(JSON.stringify({ launcherPid: child.pid }))
    process.exit(0)
  }
  if (Date.now() >= deadline) {
    clearInterval(timer)
    process.stderr.write('等待受管进程树标记超时。')
    process.exit(1)
  }
}, 25)
`, 'utf8')
}

interface TreeMarker {
  rootPid: number
  descendantPid: number
}

async function waitForTreeMarker(path: string): Promise<TreeMarker> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as { rootPid?: unknown; descendantPid?: unknown }
      if (isPid(parsed.rootPid) && isPid(parsed.descendantPid)) {
        return { rootPid: parsed.rootPid, descendantPid: parsed.descendantPid }
      }
    } catch (error) {
      if (!isTransientMarkerError(error)) throw error
    }
    await wait(25)
  }
  throw new Error(`等待进程树标记超时：${path}`)
}

function isTransientMarkerError(error: unknown): boolean {
  return error instanceof Error && (
    'code' in error && (error.code === 'ENOENT' || error.code === 'EBUSY')
    || error instanceof SyntaxError
  )
}

function isPid(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

async function waitForProcessesGone(pids: number[], timeoutMs: number, operation: string): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (pids.every(pid => !processExists(pid))) return
    await wait(50)
  }
  const survivors = pids.filter(processExists)
  throw new Error(`${operation}后仍有进程存活：${survivors.join(', ')}`)
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false
    throw error
  }
}

function spawnLauncher(arguments_: string[]): ChildProcess {
  return spawn(launcher, arguments_, {
    cwd: projectRoot,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

async function runLauncher(arguments_: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawnLauncher(arguments_)
  const output = collectOutput(child)
  const result = await waitForExit(child, 15_000)
  return { ...result, ...await output }
}

function collectOutput(child: ChildProcess): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    if (child.stdout === null || child.stderr === null) {
      reject(new Error('测试进程缺少 stdout 或 stderr。'))
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', () => resolvePromise({ stdout, stderr }))
  })
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<{ code: number | null }> {
  if (child.exitCode !== null || child.signalCode !== null) return { code: child.exitCode }
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`等待进程退出超时：pid=${String(child.pid)}`))
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', code => {
      clearTimeout(timer)
      resolvePromise({ code })
    })
  })
}
