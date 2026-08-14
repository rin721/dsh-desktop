const readyLine = /^dsh web: (http:\/\/127\.0\.0\.1:(\d{1,5}))\s*$/u
const maxRootDocumentBytes = 2 * 1024 * 1024

/**
 * 从当前官方 CLI 输出中解析严格环回就绪来源。
 * @param line - stdout 的一行文本。
 * @returns 合法来源；非就绪行返回 undefined。
 */
export function parseReadyOrigin(line: string): `http://127.0.0.1:${number}` | undefined {
  const match = readyLine.exec(line)
  if (match === null) return undefined
  const port = Number.parseInt(match[2] ?? '', 10)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return undefined
  const origin = match[1]
  if (origin !== `http://127.0.0.1:${port}`) return undefined
  return origin as `http://127.0.0.1:${number}`
}

/**
 * 独立请求 Harness 根页面，防止仅凭日志把未启动完成的进程标记为就绪。
 * @param origin - 已由 parseReadyOrigin 验证的环回来源。
 * @param signal - 超时或调用方取消信号。
 */
export async function probeHarnessOrigin(origin: `http://127.0.0.1:${number}`, signal: AbortSignal): Promise<void> {
  const response = await fetch(`${origin}/`, {
    cache: 'no-store',
    redirect: 'error',
    signal,
  })
  if (!response.ok) throw new Error(`Harness root probe 返回 HTTP ${response.status}。`)
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10)
  if (Number.isFinite(declaredLength) && declaredLength > maxRootDocumentBytes) {
    throw new Error('Harness root probe 文档超过允许大小。')
  }
  if (response.body === null) throw new Error('Harness root probe 缺少响应正文。')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > maxRootDocumentBytes) {
      await reader.cancel()
      throw new Error('Harness root probe 文档超过允许大小。')
    }
    chunks.push(chunk.value)
  }
  const html = Buffer.concat(chunks).toString('utf8')
  if (!html.includes('__DSH_BOOT__')) throw new Error('Harness root probe 缺少 __DSH_BOOT__。')
}
