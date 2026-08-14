import type { Readable, Writable } from 'node:stream'

/** Harness 受监管生命周期状态。 */
export type HarnessState = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed'

/** 可安全进入 UI 或普通日志的错误摘要。 */
export interface SafeError {
  code: string
  message: string
}

/** Harness 就绪后由监管器固定的产品与构建身份。 */
export interface ReadyInfo {
  origin: `http://127.0.0.1:${number}`
  desktopVersion: string
  harnessVersion: string
  nodeVersion: string
  buildId: string
}

/** 进程退出的正交结果；未发生的结果保持 null。 */
export interface ProcessOutcome {
  exitCode: number | null
  signal: NodeJS.Signals | null
}

/** 启动器返回的受管进程资源。 */
export interface ManagedProcess {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
  readonly done: Promise<ProcessOutcome>
  /** 终止启动器；Windows Job Object 负责同步终止其完整后代树。 */
  forceTerminate(): void
}

/** 启动 Harness 所需的全部已验证文件和进程参数。 */
export interface HarnessLaunchSpec {
  launcherPath: string
  nodePath: string
  bootstrapPath: string
  harnessBinPath: string
  workingDirectory: string
  parentPid: number
  environment: NodeJS.ProcessEnv
}

/** 桌面监管器只通过该接口创建外部进程，便于替换与故障测试。 */
export interface ProcessLauncher {
  /**
   * 创建一个已受 Windows Job Object 约束的 Harness 进程树。
   * @param spec - 已验证的可执行路径、参数和环境。
   * @returns 调用方拥有且必须等待退出的进程资源。
   */
  launch(spec: HarnessLaunchSpec): ManagedProcess
}

/** 桌面主进程消费的 Harness 生命周期接口。 */
export interface HarnessProcessSupervisor {
  /** 启动并独立探测 Harness 根页面。 */
  start(signal?: AbortSignal): Promise<ReadyInfo>
  /** 请求优雅关闭并在超时后清理完整进程树。 */
  stop(reason: 'window-close' | 'app-quit' | 'update' | 'failure'): Promise<void>
  /** 返回当前同步状态快照。 */
  state(): HarnessState
  /** 注册状态监听器并返回 disposer。 */
  onStateChange(listener: (state: HarnessState, error?: SafeError) => void): () => void
}

