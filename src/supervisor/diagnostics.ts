const assignmentSecret = /\b(api[_-]?key|token|secret|password)\b\s*[=:]\s*[^\s&]+/giu
const bearerSecret = /\bBearer\s+[^\s]+/giu
const deepSeekKey = /\bsk-(?:\[REDACTED\]|[A-Za-z0-9_-]{8,})[A-Za-z0-9_-]*/gu
const redactionLookbehindBytes = 65_536

/**
 * 从普通诊断文本中移除常见凭据形式。
 * @param value - 可能来自子进程的文本。
 * @param sensitiveRoots - 不得暴露绝对路径或内部相对路径的用户状态目录。
 * @returns 不回显原始凭据值的文本。
 */
export function redactDiagnostic(value: string, sensitiveRoots: Iterable<string> = []): string {
  let redacted = value
    .replace(assignmentSecret, (_match, name: string) => `${name}=[REDACTED]`)
    .replace(bearerSecret, 'Bearer [REDACTED]')
    .replace(deepSeekKey, 'sk-[REDACTED]')
  const variants = new Set<string>()
  for (const root of sensitiveRoots) {
    if (root.length === 0) continue
    const forward = root.replaceAll('\\', '/')
    for (const variant of [root, forward, JSON.stringify(root).slice(1, -1), JSON.stringify(forward).slice(1, -1)]) {
      if (variant.length > 0) variants.add(variant)
    }
  }
  for (const variant of [...variants].sort((left, right) => right.length - left.length)) {
    const pathAndDescendants = `${escapeRegExp(variant)}(?:[\\\\/][^\\s"'&]+)*`
    redacted = redacted.replace(new RegExp(pathAndDescendants, 'giu'), () => '$DSH_HOME/[内容已隐藏]')
  }
  return redacted
}

/** 有界、脱敏的子进程诊断尾部。 */
export class DiagnosticBuffer {
  readonly #maxBytes: number
  readonly #rawLimitBytes: number
  readonly #sensitiveRoots: readonly string[]
  #rawValue = ''

  /**
   * @param maxBytes - 保留的最大 UTF-8 字节数。
   */
  constructor(maxBytes: number, sensitiveRoots: Iterable<string> = []) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError('maxBytes 必须是正整数。')
    this.#maxBytes = maxBytes
    this.#rawLimitBytes = maxBytes + redactionLookbehindBytes
    this.#sensitiveRoots = [...sensitiveRoots]
  }

  /**
   * 追加并立即脱敏文本。
   * @param value - 新的 stdout 或 stderr 内容。
   */
  append(value: string): void {
    const combined = Buffer.from(this.#rawValue + value, 'utf8')
    if (combined.length <= this.#rawLimitBytes) {
      this.#rawValue = combined.toString('utf8')
      return
    }
    let start = combined.length - this.#rawLimitBytes
    while (start < combined.length && (combined[start] ?? 0) >> 6 === 0b10) start += 1
    this.#rawValue = combined.subarray(start).toString('utf8')
  }

  /** @returns 当前脱敏诊断尾部。 */
  text(): string {
    const redacted = Buffer.from(redactDiagnostic(this.#rawValue, this.#sensitiveRoots), 'utf8')
    if (redacted.length <= this.#maxBytes) return redacted.toString('utf8')
    let start = redacted.length - this.#maxBytes
    while (start < redacted.length && (redacted[start] ?? 0) >> 6 === 0b10) start += 1
    return redacted.subarray(start).toString('utf8')
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
