import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import type { AddressInfo } from 'node:net'
import { sanitizedAcceptanceEnvironment } from './lib/acceptance-environment.js'
import { candidatePaths } from './lib/artifacts.js'
import { pathExists, removeEphemeralTree } from './lib/project.js'

if (process.platform !== 'win32') throw new Error('打包端到端冒烟只支持 Windows。')
const candidate = await candidatePaths()
const executable = resolve(candidate.appRoot, 'dsh-desktop.exe')
if (!await pathExists(executable)) throw new Error(`缺少当前候选应用：${executable}`)
const roamingAppData = process.env.APPDATA
if (roamingAppData === undefined) throw new Error('缺少 Windows APPDATA 环境。')

const acceptanceOwner = resolve(tmpdir(), 'dsh-desktop-packaged-e2e')
const acceptanceRoot = resolve(acceptanceOwner, `${candidate.buildId}-${process.pid}`)
const dshHome = resolve(acceptanceRoot, 'DSH_HOME')
const workspace = resolve(acceptanceRoot, '工作 目录')
const log = resolve(roamingAppData, 'DSH Desktop', 'logs', 'dsh-desktop.log')
await mkdir(dshHome, { recursive: true })
await mkdir(workspace, { recursive: true })

let running: ChildProcess | undefined
let succeeded = false
try {
  const first = await launchCandidate(await textLength(log))
  running = first.child
  const firstPage = await waitForHarnessPage(first.debugPort, first.origin, 30000)
  await waitForProductUi(firstPage.webSocketDebuggerUrl, 60000)
  await verifySingleInstance()
  const listener = await verifyPackagedListener(first.origin)
  await capturePage(firstPage.webSocketDebuggerUrl, resolve(candidate.candidateRoot, 'packaged-main.png'))

  const created = asRecord(await callApi(first.origin, 'session.create', { cwd: workspace }))
  const sessionId = created.sessionId
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('session.create 未返回会话标识。')

  const streamAbort = new AbortController()
  const stream = await openMuxStream(first.origin, streamAbort.signal)
  try {
    await stream.next(frame => frameMethod(frame) === 'session/subscribed' && frameSessionId(frame) === sessionId, 15000)
    const prompt = asRecord(await callApi(first.origin, 'session.prompt', {
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: '桌面端到端持久化探针' }],
    }))
    if (prompt.accepted !== true) throw new Error('会话提示没有被成功接受。')
    await stream.next(frame => frameMethod(frame) === 'session/event'
      && frameSessionId(frame) === sessionId
      && frameEventType(frame) === 'user/message', 15000)
  } finally {
    streamAbort.abort()
    await stream.close()
  }

  const firstHistory = asRecord(await callApi(first.origin, 'session.history', { sessionId }))
  assertPromptHistory(firstHistory)
  await reloadPage(firstPage.webSocketDebuggerUrl)
  const reloadedPage = await waitForHarnessPage(first.debugPort, first.origin, 30000)
  await waitForProductUi(reloadedPage.webSocketDebuggerUrl, 60000)
  await closePageAndApplication(reloadedPage.webSocketDebuggerUrl, first.child)
  running = undefined

  const second = await launchCandidate(await textLength(log))
  running = second.child
  const secondPage = await waitForHarnessPage(second.debugPort, second.origin, 30000)
  await waitForProductUi(secondPage.webSocketDebuggerUrl, 60000)
  const listed = asRecord(await callApi(second.origin, 'session.list', {}))
  const items = listed.items
  if (!Array.isArray(items) || !items.some(item => asRecord(item).sessionId === sessionId)) {
    throw new Error('使用同一隔离 DSH_HOME 重启后，会话列表没有保留已创建会话。')
  }
  const secondHistory = asRecord(await callApi(second.origin, 'session.history', { sessionId }))
  assertPromptHistory(secondHistory)
  await closePageAndApplication(secondPage.webSocketDebuggerUrl, second.child)
  running = undefined

  const failure = await launchFailureCandidate(await textLength(log))
  running = failure.child
  const failurePage = await waitForFailurePage(failure.debugPort, 30000)
  await assertFailurePage(failurePage.webSocketDebuggerUrl)
  await capturePage(failurePage.webSocketDebuggerUrl, resolve(candidate.candidateRoot, 'failure-page.png'))
  await closePageAndApplication(failurePage.webSocketDebuggerUrl, failure.child)
  running = undefined

  const report = {
    schemaVersion: 1,
    desktopVersion: candidate.desktopVersion,
    buildId: candidate.buildId,
    packagedRendererLoaded: true,
    singleInstance: true,
    bundledNode: true,
    loopbackOnly: true,
    listeningAddresses: listener.addresses,
    sessionCreated: true,
    streamedPromptEvent: true,
    streamTransport: stream.transport,
    rendererReloaded: true,
    statePersistedAcrossRestart: true,
    isolatedDshHome: true,
    startupFailurePage: true,
    screenshotArtifacts: ['packaged-main.png', 'failure-page.png'],
    externalModelResponse: '未执行：需要发布门禁显式提供测试凭据。',
  }
  await writeFile(resolve(candidate.candidateRoot, 'packaged-e2e.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`打包端到端冒烟通过：${candidate.buildId}`)
  succeeded = true
} finally {
  if (running !== undefined && running.exitCode === null) {
    await closeApplication(running).catch(() => running?.kill())
  }
  if (succeeded) await removeEphemeralTree(acceptanceRoot, acceptanceOwner)
  else console.error(`打包端到端诊断目录已保留：${acceptanceRoot}`)
}

interface LaunchResult {
  child: ChildProcess
  origin: string
  debugPort: number
}

interface DebugPage {
  type?: unknown
  url?: unknown
  webSocketDebuggerUrl?: unknown
}

interface MuxStream {
  transport: 'sse' | 'websocket'
  next: (predicate: (frame: unknown) => boolean, timeoutMs: number) => Promise<unknown>
  close: () => Promise<void>
}

async function launchCandidate(logOffset: number): Promise<LaunchResult> {
  const debugPort = await reserveLoopbackPort()
  const environment = sanitizedAcceptanceEnvironment()
  environment.DSH_HOME = dshHome
  environment.DSH_DESKTOP_WORKSPACE = workspace
  const child = spawn(executable, [
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
  ], { cwd: workspace, env: environment, shell: false, stdio: 'ignore', windowsHide: false })
  if (child.pid === undefined) throw new Error('打包应用没有返回主进程 PID。')
  const origin = await waitForReadyLog(log, logOffset, candidate.buildId, 120000)
  return { child, origin, debugPort }
}

async function launchFailureCandidate(logOffset: number): Promise<{ child: ChildProcess; debugPort: number }> {
  const debugPort = await reserveLoopbackPort()
  const environment = sanitizedAcceptanceEnvironment()
  environment.DSH_HOME = dshHome
  environment.DSH_DESKTOP_WORKSPACE = resolve(acceptanceRoot, '不存在的工作目录')
  const child = spawn(executable, [
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
  ], { cwd: workspace, env: environment, shell: false, stdio: 'ignore', windowsHide: false })
  if (child.pid === undefined) throw new Error('故障注入应用没有返回主进程 PID。')
  await waitForLogEvent(log, logOffset, 'desktop-startup-failed', 30000)
  return { child, debugPort }
}

async function verifySingleInstance(): Promise<void> {
  const environment = sanitizedAcceptanceEnvironment()
  environment.DSH_HOME = dshHome
  environment.DSH_DESKTOP_WORKSPACE = workspace
  await runAndWait(executable, [], 15_000, { environment, cwd: workspace })
}

async function verifyPackagedListener(origin: string): Promise<{ addresses: string[] }> {
  const port = new URL(origin).port
  if (!/^\d{1,5}$/u.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error(`实际就绪来源没有有效端口：${origin}`)
  }
  const script = [
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
    `$portValue=${port}`,
    '$rows=@(Get-NetTCPConnection -LocalPort $portValue -State Listen -ErrorAction Stop)',
    '$result=@($rows | ForEach-Object {',
    '  $process=Get-CimInstance Win32_Process -Filter ("ProcessId = " + $_.OwningProcess) -ErrorAction Stop',
    '  [pscustomobject]@{ LocalAddress=$_.LocalAddress; ProcessId=$_.OwningProcess; ExecutablePath=$process.ExecutablePath }',
    '})',
    '$result | ConvertTo-Json -Compress',
  ].join('; ')
  const output = await captureCommand('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], 30_000)
  const parsed = JSON.parse(output) as ListenerRow | ListenerRow[]
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).map(parseListenerRow)
  if (rows.length === 0) throw new Error('实际就绪端口没有 Windows TCP 监听记录。')
  const addresses = [...new Set(rows.map(row => row.address))]
  if (addresses.some(address => address !== '127.0.0.1')) {
    throw new Error(`实际就绪端口存在非 IPv4 回环监听：${addresses.join(', ')}`)
  }
  const bundledNodeRoot = `${resolve(candidate.appRoot, 'resources', '.runtime', 'node').toLocaleLowerCase('en-US')}\\`
  for (const row of rows) {
    const executablePath = row.executablePath.toLocaleLowerCase('en-US')
    if (!executablePath.startsWith(bundledNodeRoot) || basename(executablePath) !== 'node.exe') {
      throw new Error(`实际就绪端口不是由候选内置 Node.js 监听：pid=${String(row.processId)}`)
    }
  }
  return { addresses }
}

interface ListenerRow {
  LocalAddress?: unknown
  ProcessId?: unknown
  ExecutablePath?: unknown
}

function parseListenerRow(value: ListenerRow): { address: string; processId: number; executablePath: string } {
  if (typeof value.LocalAddress !== 'string'
    || typeof value.ProcessId !== 'number' || !Number.isSafeInteger(value.ProcessId) || value.ProcessId <= 0
    || typeof value.ExecutablePath !== 'string' || value.ExecutablePath.length === 0) {
    throw new Error('Windows TCP 监听检查返回无效字段。')
  }
  return { address: value.LocalAddress, processId: value.ProcessId, executablePath: value.ExecutablePath }
}

async function callApi(origin: string, method: string, payload: unknown): Promise<unknown> {
  const rpcId = `desktop-e2e-${process.pid}-${Date.now()}`
  const response = await fetch(`${origin}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`${method} 返回 HTTP ${response.status}。`)
  const envelope = asRecord(await response.json())
  if (envelope.type !== 'server-response' || envelope.rpcId !== rpcId) throw new Error(`${method} 返回无效 RPC 信封。`)
  const result = asRecord(envelope.result)
  if (result.ok !== true) throw new Error(`${method} 失败：${safeJson(result.error)}`)
  return result.value
}

async function openMuxStream(origin: string, signal: AbortSignal): Promise<MuxStream> {
  const response = await fetch(`${origin}/api/events.mux`, { signal })
  if (response.ok && response.headers.get('content-type')?.startsWith('text/event-stream') === true && response.body !== null) {
    return sseMuxStream(response, signal)
  }
  await response.body?.cancel()
  return webSocketMuxStream(origin, signal)
}

function sseMuxStream(response: Response, _signal: AbortSignal): MuxStream {
  if (response.body === null) throw new Error('SSE mux 响应缺少 body。')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  return {
    transport: 'sse',
    next: async (predicate, timeoutMs) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = block.split(/\r?\n/u).filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
          if (data.length > 0) {
            const frame: unknown = JSON.parse(data)
            if (predicate(frame)) return frame
          }
          boundary = buffer.indexOf('\n\n')
        }
        const remaining = deadline - Date.now()
        const result = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('等待 SSE 帧超时。')), remaining)),
        ])
        if (result.done) throw new Error('SSE mux 流在收到预期帧前结束。')
        buffer += decoder.decode(result.value, { stream: true }).replaceAll('\r\n', '\n')
      }
      throw new Error('等待 SSE 帧超时。')
    },
    close: async () => reader.cancel().catch(() => undefined),
  }
}

async function webSocketMuxStream(origin: string, signal: AbortSignal): Promise<MuxStream> {
  const endpoint = `${origin.replace(/^http:/u, 'ws:')}/api/events.mux`
  const socket = new WebSocket(endpoint)
  const frames: unknown[] = []
  let failure: Error | undefined
  socket.addEventListener('message', event => {
    try {
      frames.push(JSON.parse(String(event.data)))
    } catch (error) {
      failure = new Error('WebSocket mux 返回非 JSON 帧。', { cause: error })
    }
  })
  socket.addEventListener('error', () => { failure = new Error('WebSocket mux 连接失败。') })
  socket.addEventListener('close', event => {
    if (!signal.aborted && event.code !== 1000) failure = new Error(`WebSocket mux 意外关闭：${event.code}`)
  })
  signal.addEventListener('abort', () => socket.close(1000, 'acceptance complete'), { once: true })
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('建立 WebSocket mux 超时。')), 15000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolvePromise()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('无法建立 WebSocket mux。'))
    }, { once: true })
  })
  return {
    transport: 'websocket',
    next: async (predicate, timeoutMs) => waitUntil(async () => {
      if (failure !== undefined) throw failure
      const index = frames.findIndex(predicate)
      if (index < 0) return undefined
      return frames.splice(index, 1)[0]
    }, timeoutMs, '等待 WebSocket mux 帧超时。'),
    close: async () => {
      if (socket.readyState === WebSocket.CLOSED) return
      await new Promise<void>(resolvePromise => {
        const timer = setTimeout(resolvePromise, 2000)
        socket.addEventListener('close', () => {
          clearTimeout(timer)
          resolvePromise()
        }, { once: true })
        if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'acceptance complete')
      })
    },
  }
}

function frameMethod(frame: unknown): unknown {
  return asRecord(frame).method
}

function frameSessionId(frame: unknown): unknown {
  return asRecord(asRecord(frame).payload).sessionId
}

function frameEventType(frame: unknown): string {
  const value = asRecord(asRecord(asRecord(frame).payload).event).type
  return typeof value === 'string' ? value : ''
}

function assertPromptHistory(history: Record<string, unknown>): void {
  const events = history.events
  if (!Array.isArray(events)) throw new Error('session.history 没有返回事件数组。')
  const types = events.map(entry => asRecord(asRecord(entry).event).type)
  if (!types.includes('user/message')) throw new Error('持久化历史缺少用户提示事件。')
}

async function waitForReadyLog(path: string, offset: number, buildId: string, timeoutMs: number): Promise<string> {
  return waitUntil(async () => {
    if (!await pathExists(path)) return undefined
    const content = await readFile(path, 'utf8')
    for (const line of content.slice(offset).split(/\r?\n/u)) {
      try {
        const record = asRecord(JSON.parse(line))
        const details = asRecord(record.details)
        if (record.event === 'harness-ready' && details.buildId === buildId && typeof details.origin === 'string') return details.origin
      } catch {
        // 忽略并发日志中的不完整末行，下一轮会重新读取。
      }
    }
    return undefined
  }, timeoutMs, '打包应用未在时限内报告 Harness 就绪。')
}

async function waitForHarnessPage(port: number, origin: string, timeoutMs: number): Promise<{ webSocketDebuggerUrl: string }> {
  return waitUntil(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })
      if (!response.ok) return undefined
      const pages = await response.json() as DebugPage[]
      const page = pages.find(item => item.type === 'page' && typeof item.url === 'string' && new URL(item.url).origin === origin)
      return typeof page?.webSocketDebuggerUrl === 'string' ? { webSocketDebuggerUrl: page.webSocketDebuggerUrl } : undefined
    } catch {
      return undefined
    }
  }, timeoutMs, 'Electron renderer 未加载已验证 Harness 来源。')
}

async function waitForFailurePage(port: number, timeoutMs: number): Promise<{ webSocketDebuggerUrl: string }> {
  return waitUntil(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })
      if (!response.ok) return undefined
      const pages = await response.json() as DebugPage[]
      const page = pages.find(item => item.type === 'page' && typeof item.url === 'string'
        && item.url.startsWith('file:') && new URL(item.url).pathname.endsWith('/failure.html'))
      return typeof page?.webSocketDebuggerUrl === 'string' ? { webSocketDebuggerUrl: page.webSocketDebuggerUrl } : undefined
    } catch {
      return undefined
    }
  }, timeoutMs, '故障注入没有显示桌面错误页。')
}

async function waitForProductUi(webSocketDebuggerUrl: string, timeoutMs: number): Promise<void> {
  await waitUntil(async () => {
    try {
      const result = asRecord(await devtoolsCommand(webSocketDebuggerUrl, 5, 'Runtime.evaluate', {
        expression: '({ state: document.readyState, text: document.body.innerText })',
        returnByValue: true,
      }))
      const value = asRecord(asRecord(result.result).value)
      return value.state === 'complete' && typeof value.text === 'string' && value.text.length > 0
        && !value.text.includes('Loading plugins...') ? true : undefined
    } catch {
      return undefined
    }
  }, timeoutMs, 'Harness renderer 未在时限内完成插件加载。')
}

async function capturePage(webSocketDebuggerUrl: string, output: string): Promise<void> {
  const result = asRecord(await devtoolsCommand(webSocketDebuggerUrl, 3, 'Page.captureScreenshot', { format: 'png' }))
  if (typeof result.data !== 'string' || result.data.length === 0) throw new Error('Electron 没有返回页面截图。')
  await writeFile(output, Buffer.from(result.data, 'base64'))
}

async function assertFailurePage(webSocketDebuggerUrl: string): Promise<void> {
  const result = asRecord(await devtoolsCommand(webSocketDebuggerUrl, 4, 'Runtime.evaluate', {
    expression: '({ text: document.body.innerText, buttons: [...document.querySelectorAll("button")].map(button => button.textContent) })',
    returnByValue: true,
  }))
  const value = asRecord(asRecord(result.result).value)
  const text = value.text
  const buttons = value.buttons
  if (typeof text !== 'string' || !text.includes('桌面运行时校验或初始化失败')) throw new Error('错误页没有显示安全故障摘要。')
  if (!Array.isArray(buttons) || !buttons.includes('重新启动') || !buttons.includes('退出')) throw new Error('错误页缺少重新启动或退出操作。')
}

async function devtoolsCommand(webSocketDebuggerUrl: string, id: number, method: string, params: Record<string, unknown>): Promise<unknown> {
  const socket = new WebSocket(webSocketDebuggerUrl)
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('连接 Electron 调试端点超时。')), 10000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolvePromise()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('无法连接 Electron 调试端点。'))
    }, { once: true })
  })
  try {
    socket.send(JSON.stringify({ id, method, params }))
    return await new Promise<unknown>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`Electron 调试命令未确认：${method}`)), 15000)
      socket.addEventListener('message', event => {
        const response = asRecord(JSON.parse(String(event.data)))
        if (response.id !== id) return
        clearTimeout(timer)
        if (response.error !== undefined) reject(new Error(`Electron 调试命令失败：${method}`))
        else resolvePromise(response.result)
      })
    })
  } finally {
    socket.close()
  }
}

async function reloadPage(webSocketDebuggerUrl: string): Promise<void> {
  const socket = new WebSocket(webSocketDebuggerUrl)
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('连接 Electron 调试端点超时。')), 10000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolvePromise()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('无法连接 Electron 调试端点。'))
    }, { once: true })
  })
  try {
    socket.send(JSON.stringify({ id: 1, method: 'Page.reload', params: { ignoreCache: false } }))
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('Electron renderer 刷新未确认。')), 15000)
      socket.addEventListener('message', event => {
        const response = asRecord(JSON.parse(String(event.data)))
        if (response.id !== 1) return
        clearTimeout(timer)
        resolvePromise()
      })
    })
  } finally {
    socket.close()
  }
}

async function closePageAndApplication(webSocketDebuggerUrl: string, child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  try {
    const socket = new WebSocket(webSocketDebuggerUrl)
    await new Promise<void>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error('连接 Electron 页面关闭端点超时。')), 10000)
      socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolvePromise()
      }, { once: true })
      socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('无法连接 Electron 页面关闭端点。'))
      }, { once: true })
    })
    socket.send(JSON.stringify({ id: 2, method: 'Page.close' }))
    await waitForChildExit(child, 30000)
    socket.close()
  } catch {
    await closeApplication(child)
  }
}

async function closeApplication(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return
  const script = '$process=Get-Process -Id ([int]$args[0]) -ErrorAction Stop; if (-not $process.CloseMainWindow()) { exit 2 }'
  await runAndWait('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script, String(child.pid)], 30000)
  await waitForChildExit(child, 30000)
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    if (child.exitCode !== null) return resolvePromise()
    const timer = setTimeout(() => reject(new Error('打包应用未在正常关窗后退出。')), timeoutMs)
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

async function runAndWait(
  command: string,
  arguments_: string[],
  timeoutMs: number,
  options: { environment?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
      ...(options.environment === undefined ? {} : { env: options.environment }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`命令超时：${basename(command)}`))
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', code => {
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else reject(new Error(`命令失败：${basename(command)} code=${String(code)}`))
    })
  })
}

async function captureCommand(command: string, arguments_: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`命令超时：${basename(command)}`))
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', code => {
      clearTimeout(timer)
      if (code === 0) resolvePromise(stdout.trim())
      else reject(new Error(`命令失败：${basename(command)} code=${String(code)} stderr=${stderr.trim()}`))
    })
  })
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address() as AddressInfo
  await new Promise<void>((resolvePromise, reject) => server.close(error => error === undefined ? resolvePromise() : reject(error)))
  return address.port
}

async function textLength(path: string): Promise<number> {
  try {
    return (await readFile(path, 'utf8')).length
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
}

async function waitForLogEvent(path: string, offset: number, event: string, timeoutMs: number): Promise<void> {
  await waitUntil(async () => {
    if (!await pathExists(path)) return undefined
    const content = await readFile(path, 'utf8')
    return content.slice(offset).split(/\r?\n/u).some(line => line.includes(`"event":"${event}"`)) ? true : undefined
  }, timeoutMs, `日志未在时限内出现 ${event}。`)
}

async function waitUntil<T>(probe: () => Promise<T | undefined>, timeoutMs: number, message: string): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value !== undefined) return value
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250))
  }
  throw new Error(message)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`预期对象，实际为 ${safeJson(value)}。`)
  return value as Record<string, unknown>
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
