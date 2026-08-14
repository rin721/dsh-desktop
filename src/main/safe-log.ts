import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { redactDiagnostic } from '../supervisor/diagnostics.js'

/** 只接收已分类事件，并在落盘前再次执行凭据脱敏。 */
export class SafeLog {
  readonly #path: string
  readonly #sensitiveRoots = new Set<string>()
  #pending: Promise<void> = Promise.resolve()

  /**
   * @param path - 当前用户目录下的日志文件绝对路径。
   * @param sensitiveRoots - 不得写入日志的用户状态绝对路径。
   */
  constructor(path: string, sensitiveRoots: Iterable<string> = []) {
    this.#path = path
    for (const root of sensitiveRoots) this.#sensitiveRoots.add(root)
  }

  /** @param root - 后续日志必须隐藏的用户状态绝对路径。 */
  addSensitiveRoot(root: string): void {
    if (root.length > 0) this.#sensitiveRoots.add(root)
  }

  /**
   * 追加一条单行 JSON 日志；写入失败不会反向破坏应用生命周期。
   * @param event - 稳定事件名。
   * @param details - 已有界的诊断或产品身份字段。
   */
  write(event: string, details: Record<string, unknown> = {}): void {
    const safeDetails = JSON.parse(redactDiagnostic(JSON.stringify(details), this.#sensitiveRoots)) as unknown
    const line = `${JSON.stringify({ time: new Date().toISOString(), event, details: safeDetails })}\n`
    this.#pending = this.#pending
      .then(async () => {
        await mkdir(dirname(this.#path), { recursive: true })
        await appendFile(this.#path, line, 'utf8')
      })
      .catch(() => undefined)
  }

  /** 等待当前已排队日志完成，不接受新的生命周期所有权。 */
  async flush(): Promise<void> {
    await this.#pending
  }
}
