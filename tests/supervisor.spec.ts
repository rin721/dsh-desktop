import { PassThrough } from 'node:stream'
import { setImmediate as waitImmediate } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
import type { ManagedProcess, ProcessLauncher, ProcessOutcome } from '../src/supervisor/contracts.js'
import { DefaultHarnessProcessSupervisor, HarnessSupervisorError } from '../src/supervisor/harness-process-supervisor.js'

interface FakeProcess extends ManagedProcess {
  stdin: PassThrough
  stdout: PassThrough
  stderr: PassThrough
  settle(outcome?: ProcessOutcome): void
}

describe('HarnessProcessSupervisor', () => {
  it('经过日志解析和独立探测后进入 ready，并等待优雅关闭', async () => {
    const child = fakeProcess({ settleOnStdinEnd: true })
    const probe = vi.fn(async () => undefined)
    const states: string[] = []
    const supervisor = createSupervisor(() => child, { probe })
    supervisor.onStateChange(state => states.push(state))

    const start = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567\n')
    await expect(start).resolves.toMatchObject({ origin: 'http://127.0.0.1:4567', harnessVersion: 'test-harness' })
    expect(probe).toHaveBeenCalledWith('http://127.0.0.1:4567', expect.any(AbortSignal))

    await supervisor.stop('app-quit')
    expect(states).toEqual(['starting', 'ready', 'stopping', 'stopped'])
    expect(child.forceTerminate).not.toHaveBeenCalled()
    expect(child.stdin.read()?.toString()).toContain('"reason":"app-quit"')
  })

  it('启动器同步失败时进入 failed 而不滞留 starting', async () => {
    const supervisor = createSupervisor(() => { throw new Error('spawn failed') })
    await expect(supervisor.start()).rejects.toBeInstanceOf(HarnessSupervisorError)
    expect(supervisor.state()).toBe('failed')
  })

  it('启动中关闭会取消启动并达到 stopped', async () => {
    const child = fakeProcess({ settleOnStdinEnd: true })
    const supervisor = createSupervisor(() => child)
    const start = supervisor.start()
    await supervisor.stop('window-close')
    await expect(start).rejects.toMatchObject({ code: 'startup-aborted' })
    expect(supervisor.state()).toBe('stopped')
  })

  it('监听器及监听器错误处理器抛错都不破坏生命周期', async () => {
    const child = fakeProcess({ settleOnStdinEnd: true })
    const supervisor = createSupervisor(() => child, {
      onListenerError: () => { throw new Error('observer failed') },
    })
    supervisor.onStateChange(() => { throw new Error('listener failed') })
    const start = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567\n')
    await expect(start).resolves.toBeDefined()
    await expect(supervisor.stop('app-quit')).resolves.toBeUndefined()
  })

  it('就绪后的意外退出独立报告退出码并进入 failed', async () => {
    const child = fakeProcess()
    const errors: Array<{ code: string; message: string }> = []
    const supervisor = createSupervisor(() => child)
    supervisor.onStateChange((_state, error) => { if (error !== undefined) errors.push(error) })
    const start = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567\n')
    await start
    child.settle({ exitCode: 23, signal: null })
    await waitImmediate()
    expect(supervisor.state()).toBe('failed')
    expect(errors.at(-1)).toMatchObject({ code: 'unexpected-exit' })
    expect(errors.at(-1)?.message).toContain('code=23 signal=null')
  })

  it('优雅截止时间后调用进程树强制清理并等待退出', async () => {
    const child = fakeProcess({ settleOnForce: true })
    const errors: string[] = []
    const supervisor = createSupervisor(() => child, { shutdownTimeoutMs: 5 })
    supervisor.onStateChange((_state, error) => { if (error !== undefined) errors.push(error.code) })
    const start = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567\n')
    await start
    await supervisor.stop('app-quit')
    expect(child.forceTerminate).toHaveBeenCalledOnce()
    expect(errors).toContain('forced-shutdown')
    expect(supervisor.state()).toBe('stopped')
  })

  it('强制清理后仍未退出时有界失败而不报告 stopped', async () => {
    const child = fakeProcess()
    const supervisor = createSupervisor(() => child, { shutdownTimeoutMs: 5 })
    const start = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567\n')
    await start

    await expect(supervisor.stop('app-quit')).rejects.toMatchObject({ code: 'shutdown-failed' })
    expect(child.forceTerminate).toHaveBeenCalledOnce()
    expect(supervisor.state()).toBe('failed')
  })

  it('就绪前退出会保留脱敏诊断并完成清理', async () => {
    const child = fakeProcess()
    const supervisor = createSupervisor(() => child)
    const start = supervisor.start()
    child.stderr.write('token=private-value startup failed\n')
    child.settle({ exitCode: 12, signal: null })

    await expect(start).rejects.toMatchObject({ code: 'startup-failed' })
    expect(supervisor.diagnostics()).toContain('token=[REDACTED]')
    expect(supervisor.diagnostics()).not.toContain('private-value')
    expect(supervisor.state()).toBe('failed')
  })

  it('就绪超时后强制清理并报告启动失败', async () => {
    const child = fakeProcess({ settleOnForce: true })
    const supervisor = createSupervisor(() => child, { readinessTimeoutMs: 5, shutdownTimeoutMs: 5 })

    await expect(supervisor.start()).rejects.toMatchObject({ code: 'startup-failed' })
    expect(child.forceTerminate).toHaveBeenCalledOnce()
    expect(supervisor.state()).toBe('failed')
  })

  it('启动清理无法确认静止时不滞留 starting', async () => {
    const child = fakeProcess()
    const supervisor = createSupervisor(() => child, { readinessTimeoutMs: 5, shutdownTimeoutMs: 5 })

    await expect(supervisor.start()).rejects.toMatchObject({ code: 'startup-cleanup-failed' })
    expect(child.forceTerminate).toHaveBeenCalledOnce()
    expect(supervisor.state()).toBe('failed')
  })
})

function createSupervisor(
  launch: () => ManagedProcess,
  overrides: {
    probe?: (origin: `http://127.0.0.1:${number}`, signal: AbortSignal) => Promise<void>
    readinessTimeoutMs?: number
    shutdownTimeoutMs?: number
    onListenerError?: (error: unknown) => void
  } = {},
): DefaultHarnessProcessSupervisor {
  const launcher: ProcessLauncher = { launch }
  return new DefaultHarnessProcessSupervisor({
    launcher,
    launchSpec: {
      launcherPath: 'launcher.exe',
      nodePath: 'node.exe',
      bootstrapPath: 'bootstrap.js',
      harnessBinPath: 'bin.js',
      workingDirectory: 'C:\\workspace',
      parentPid: 100,
      environment: {},
    },
    identity: {
      desktopVersion: 'test-desktop',
      harnessVersion: 'test-harness',
      nodeVersion: 'test-node',
      buildId: 'test-build',
    },
    readinessTimeoutMs: overrides.readinessTimeoutMs ?? 50,
    shutdownTimeoutMs: overrides.shutdownTimeoutMs ?? 50,
    maxDiagnosticBytes: 4096,
    probe: overrides.probe ?? (async () => undefined),
    ...(overrides.onListenerError === undefined ? {} : { onListenerError: overrides.onListenerError }),
  })
}

function fakeProcess(options: { settleOnStdinEnd?: boolean; settleOnForce?: boolean } = {}): FakeProcess {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  let resolveDone: (outcome: ProcessOutcome) => void = () => undefined
  let settled = false
  const done = new Promise<ProcessOutcome>(resolve => { resolveDone = resolve })
  const settle = (outcome: ProcessOutcome = { exitCode: 0, signal: null }): void => {
    if (settled) return
    settled = true
    stdout.end()
    stderr.end()
    resolveDone(outcome)
  }
  if (options.settleOnStdinEnd === true) stdin.once('finish', () => settle())
  const forceTerminate = vi.fn(() => {
    if (options.settleOnForce === true) settle({ exitCode: 1, signal: null })
  })
  return { stdin, stdout, stderr, done, forceTerminate, settle }
}
