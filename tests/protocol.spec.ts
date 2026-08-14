import { describe, expect, it } from 'vitest'
import { parseControlMessage, supervisorProtocolVersion } from '../src/bootstrap/protocol.js'

describe('监管控制协议', () => {
  it('只接受完整且版本匹配的关闭消息', () => {
    expect(parseControlMessage(JSON.stringify({
      version: supervisorProtocolVersion,
      type: 'shutdown',
      reason: 'app-quit',
    }))).toEqual({ version: 1, type: 'shutdown', reason: 'app-quit' })
  })

  it.each([
    'not-json',
    '[]',
    '{"version":2,"type":"shutdown","reason":"app-quit"}',
    '{"version":1,"type":"restart","reason":"app-quit"}',
    '{"version":1,"type":"shutdown","reason":"unknown"}',
  ])('拒绝不受支持的输入：%s', input => {
    expect(() => parseControlMessage(input)).toThrow(TypeError)
  })
})

