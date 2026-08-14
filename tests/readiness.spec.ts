import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { parseReadyOrigin, probeHarnessOrigin } from '../src/supervisor/readiness.js'

const closers: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

describe('Harness 就绪协议', () => {
  it('只解析严格环回 URL 行', () => {
    expect(parseReadyOrigin('dsh web: http://127.0.0.1:4567')).toBe('http://127.0.0.1:4567')
    expect(parseReadyOrigin('dsh web: http://0.0.0.0:4567')).toBeUndefined()
    expect(parseReadyOrigin('prefix dsh web: http://127.0.0.1:4567')).toBeUndefined()
    expect(parseReadyOrigin('dsh web: http://127.0.0.1:0')).toBeUndefined()
    expect(parseReadyOrigin('dsh web: http://127.0.0.1:65536')).toBeUndefined()
  })

  it('独立探测带产品启动标记的根页面', async () => {
    const origin = await serve('<script>window.__DSH_BOOT__={}</script>')
    await expect(probeHarnessOrigin(origin, AbortSignal.timeout(2000))).resolves.toBeUndefined()
  })

  it('拒绝没有产品启动标记的页面', async () => {
    const origin = await serve('<html>other service</html>')
    await expect(probeHarnessOrigin(origin, AbortSignal.timeout(2000))).rejects.toThrow('__DSH_BOOT__')
  })

  it('在未声明长度的响应超过上限时停止读取', async () => {
    const origin = await serve(`${'x'.repeat(2 * 1024 * 1024)}__DSH_BOOT__`, false)
    await expect(probeHarnessOrigin(origin, AbortSignal.timeout(5000))).rejects.toThrow('超过允许大小')
  })
})

async function serve(body: string, includeLength = true): Promise<`http://127.0.0.1:${number}`> {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      ...(includeLength ? { 'content-length': Buffer.byteLength(body) } : {}),
    })
    if (includeLength) response.end(body)
    else {
      response.write(body.slice(0, 1024 * 1024))
      response.end(body.slice(1024 * 1024))
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  closers.push(() => new Promise<void>((resolve, reject) => {
    server.close(error => error === undefined ? resolve() : reject(error))
  }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('测试服务器未返回 TCP 地址。')
  return `http://127.0.0.1:${address.port}`
}
