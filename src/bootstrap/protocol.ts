/** 桌面父进程与零源码 bootstrap 之间的控制消息版本。 */
export const supervisorProtocolVersion = 1 as const

/** 当前唯一受支持的父进程控制消息。 */
export interface ShutdownControlMessage {
  version: typeof supervisorProtocolVersion
  type: 'shutdown'
  reason: 'window-close' | 'app-quit' | 'update' | 'failure'
}

/**
 * 解析来自父进程 stdin 的一行 JSON 控制消息。
 * @param line - 不受信任的单行文本。
 * @returns 完整验证的关闭消息。
 */
export function parseControlMessage(line: string): ShutdownControlMessage {
  let value: unknown
  try {
    value = JSON.parse(line) as unknown
  } catch {
    throw new TypeError('控制消息不是有效 JSON。')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('控制消息必须是对象。')
  }
  const candidate = value as Record<string, unknown>
  if (candidate.version !== supervisorProtocolVersion || candidate.type !== 'shutdown') {
    throw new TypeError('控制消息版本或类型不受支持。')
  }
  const reason = candidate.reason
  if (reason !== 'window-close' && reason !== 'app-quit' && reason !== 'update' && reason !== 'failure') {
    throw new TypeError('关闭原因不受支持。')
  }
  return { version: supervisorProtocolVersion, type: 'shutdown', reason }
}

