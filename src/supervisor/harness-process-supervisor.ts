import { createInterface } from 'node:readline'
import type { ShutdownControlMessage } from '../bootstrap/protocol.js'
import { supervisorProtocolVersion } from '../bootstrap/protocol.js'
import type {
  HarnessLaunchSpec,
  HarnessProcessSupervisor,
  HarnessState,
  ManagedProcess,
  ProcessLauncher,
  ReadyInfo,
  SafeError,
} from './contracts.js'
import { DiagnosticBuffer } from './diagnostics.js'
import { parseReadyOrigin, probeHarnessOrigin } from './readiness.js'

interface SupervisorOptions {
  launcher: ProcessLauncher
  launchSpec: HarnessLaunchSpec
  identity: Omit<ReadyInfo, 'origin'>
  readinessTimeoutMs: number
  shutdownTimeoutMs: number
  maxDiagnosticBytes: number
  sensitiveRoots?: readonly string[]
  probe?: typeof probeHarnessOrigin
  onListenerError?: (error: unknown) => void
}

/** 包含可安全持久化的脱敏诊断，不应直接显示原始子进程输出。 */
export class HarnessSupervisorError extends Error {
  readonly code: string
  readonly diagnostics: string

  /**
   * @param code - 稳定错误分类。
   * @param message - 可显示给用户的安全摘要。
   * @param diagnostics - 已脱敏且有界的进程输出。
   * @param cause - 原始错误，仅用于主进程错误链。
   */
  constructor(code: string, message: string, diagnostics: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'HarnessSupervisorError'
    this.code = code
    this.diagnostics = diagnostics
  }
}

async function settleBeforeTimeout(done: Promise<unknown>, ms: number): Promise<'done' | 'timeout'> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), ms)
    timer.unref()
  })
  try {
    return await Promise.race([
      done.then(() => 'done' as const, () => 'done' as const),
      deadline,
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false
}

/** 监管一个外部 Harness runtime，并使每次关闭都等待进程达到静止状态。 */
export class DefaultHarnessProcessSupervisor implements HarnessProcessSupervisor {
  readonly #options: SupervisorOptions
  readonly #listeners = new Set<(state: HarnessState, error?: SafeError) => void>()
  #state: HarnessState = 'idle'
  #process: ManagedProcess | undefined
  #lastDiagnostics = ''
  #startAbort: AbortController | undefined
  #startOperation: Promise<ReadyInfo> | undefined

  /**
   * @param options - 已验证的版本身份、路径、启动器和生命周期截止时间。
   */
  constructor(options: SupervisorOptions) {
    this.#options = options
  }

  /** @inheritdoc */
  state(): HarnessState {
    return this.#state
  }

  /** 返回最近一次启动或运行失败的脱敏诊断尾部。 */
  diagnostics(): string {
    return this.#lastDiagnostics
  }

  /** @inheritdoc */
  onStateChange(listener: (state: HarnessState, error?: SafeError) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** @inheritdoc */
  async start(signal?: AbortSignal): Promise<ReadyInfo> {
    if (this.#state !== 'idle' && this.#state !== 'stopped' && this.#state !== 'failed') {
      throw new HarnessSupervisorError('invalid-state', `Harness 不能从 ${this.#state} 状态启动。`, '')
    }
    if (isAborted(signal)) throw signal?.reason

    this.#setState('starting')
    const internalAbort = new AbortController()
    this.#startAbort = internalAbort
    const combinedSignal = signal === undefined
      ? internalAbort.signal
      : AbortSignal.any([signal, internalAbort.signal])
    const operation = this.#startInternal(combinedSignal)
    this.#startOperation = operation
    try {
      return await operation
    } finally {
      if (this.#startOperation === operation) this.#startOperation = undefined
      if (this.#startAbort === internalAbort) this.#startAbort = undefined
    }
  }

  async #startInternal(signal: AbortSignal): Promise<ReadyInfo> {
    const diagnostics = new DiagnosticBuffer(this.#options.maxDiagnosticBytes, this.#options.sensitiveRoots)
    let child: ManagedProcess | undefined

    try {
      if (isAborted(signal)) throw signal.reason
      child = this.#options.launcher.launch(this.#options.launchSpec)
      this.#process = child
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => diagnostics.append(String(chunk)))
      child.stderr.on('data', chunk => diagnostics.append(String(chunk)))
      child.stdin.on('error', error => diagnostics.append(`stdin: ${(error as Error).message}\n`))

      const origin = await this.#waitForReadiness(child, signal)
      const probeSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.min(this.#options.readinessTimeoutMs, 5000)),
      ])
      await (this.#options.probe ?? probeHarnessOrigin)(origin, probeSignal)
      if (this.#process !== child) throw new Error('Harness 启动所有权在 probe 期间改变。')

      const ready = { origin, ...this.#options.identity }
      this.#setState('ready')
      void child.done.then(outcome => {
        if (this.#process !== child || this.#state === 'stopping' || this.#state === 'stopped') return
        this.#process = undefined
        this.#lastDiagnostics = diagnostics.text()
        this.#setState('failed', {
          code: 'unexpected-exit',
          message: `Harness 意外退出：code=${String(outcome.exitCode)} signal=${String(outcome.signal)}`,
        })
      }, error => {
        if (this.#process !== child) return
        this.#process = undefined
        this.#lastDiagnostics = diagnostics.text()
        this.#setState('failed', { code: 'process-error', message: `Harness 进程监听失败：${String(error)}` })
      })
      return ready
    } catch (error) {
      this.#lastDiagnostics = diagnostics.text()
      let cleanupError: unknown
      if (child !== undefined) {
        try {
          await this.#terminate(child, 'failure')
          if (this.#process === child) this.#process = undefined
        } catch (caught) {
          cleanupError = caught
        }
      }
      const aborted = isAborted(signal)
      const safeError: SafeError = {
        code: cleanupError !== undefined ? 'startup-cleanup-failed' : aborted ? 'startup-aborted' : 'startup-failed',
        message: cleanupError !== undefined
          ? 'Harness 启动失败，且进程树未能确认静止。请退出桌面应用。'
          : aborted ? 'Harness 启动已取消。' : 'Harness 未能完成桌面启动。',
      }
      this.#setState('failed', safeError)
      const cause = cleanupError === undefined ? error : new AggregateError([error, cleanupError], safeError.message)
      throw new HarnessSupervisorError(safeError.code, safeError.message, this.#lastDiagnostics, cause)
    }
  }

  /** @inheritdoc */
  async stop(reason: ShutdownControlMessage['reason']): Promise<void> {
    if (this.#state === 'starting' && this.#startOperation !== undefined) {
      const operation = this.#startOperation
      this.#startAbort?.abort(new Error('桌面正在关闭。'))
      await operation.catch(() => undefined)
    }
    const child = this.#process
    if (child === undefined) {
      if (this.#state !== 'idle') this.#setState('stopped')
      return
    }
    if (this.#state === 'stopping') {
      await child.done.catch(() => undefined)
      return
    }
    this.#setState('stopping')
    let timedOut: boolean
    try {
      timedOut = await this.#terminate(child, reason)
    } catch (error) {
      this.#setState('failed', {
        code: 'shutdown-failed',
        message: 'Harness 进程树在强制清理后仍未确认静止。',
      })
      throw error
    }
    if (this.#process === child) this.#process = undefined
    this.#setState('stopped', timedOut
      ? { code: 'forced-shutdown', message: 'Harness 超过优雅关闭截止时间，已清理受管进程树。' }
      : undefined)
  }

  async #waitForReadiness(child: ManagedProcess, signal?: AbortSignal): Promise<`http://127.0.0.1:${number}`> {
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (action: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        lines.close()
        action()
      }
      const timer = setTimeout(() => finish(() => reject(new Error('Harness readiness 超时。'))), this.#options.readinessTimeoutMs)
      const onAbort = (): void => finish(() => reject(signal?.reason ?? new Error('Harness 启动已取消。')))
      signal?.addEventListener('abort', onAbort, { once: true })
      lines.on('line', line => {
        const origin = parseReadyOrigin(line)
        if (origin !== undefined) finish(() => resolve(origin))
      })
      void child.done.then(outcome => finish(() => reject(new Error(
        `Harness 在就绪前退出：code=${String(outcome.exitCode)} signal=${String(outcome.signal)}`,
      ))), error => finish(() => reject(error)))
    })
  }

  async #terminate(child: ManagedProcess, reason: ShutdownControlMessage['reason']): Promise<boolean> {
    const message: ShutdownControlMessage = { version: supervisorProtocolVersion, type: 'shutdown', reason }
    if (!child.stdin.destroyed && child.stdin.writable) child.stdin.end(`${JSON.stringify(message)}\n`)
    const result = await settleBeforeTimeout(child.done, this.#options.shutdownTimeoutMs)
    if (result === 'done') return false
    child.forceTerminate()
    const forcedResult = await settleBeforeTimeout(child.done, this.#options.shutdownTimeoutMs)
    if (forcedResult === 'timeout') {
      throw new HarnessSupervisorError(
        'shutdown-failed',
        'Harness 进程树在强制清理后仍未确认静止。',
        this.#lastDiagnostics,
      )
    }
    return true
  }

  #setState(state: HarnessState, error?: SafeError): void {
    this.#state = state
    for (const listener of this.#listeners) {
      try {
        if (error === undefined) listener(state)
        else listener(state, error)
      } catch (listenerError) {
        try {
          this.#options.onListenerError?.(listenerError)
        } catch {
          // 状态监听属于旁路观测，任何回调异常都不得破坏生命周期所有权。
        }
      }
    }
  }
}
