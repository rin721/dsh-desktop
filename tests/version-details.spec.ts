import { describe, expect, it } from 'vitest'
import { createVersionSnapshot, formatVersionDetails } from '../src/main/version-details.js'

const identity = {
  origin: 'http://127.0.0.1:43125' as const,
  desktopVersion: '1.2.3',
  harnessVersion: '4.5.6',
  nodeVersion: '24.11.1',
  buildId: 'abc123',
}

describe('版本诊断快照', () => {
  it('只保留经过验证的四个产品身份字段', () => {
    expect(createVersionSnapshot(identity)).toEqual({
      desktopVersion: '1.2.3',
      harnessVersion: '4.5.6',
      nodeVersion: '24.11.1',
      buildId: 'abc123',
    })
    expect(formatVersionDetails(identity)).toBe([
      '桌面版本：1.2.3',
      'Harness：4.5.6',
      'Node.js：24.11.1',
      '构建标识：abc123',
    ].join('\n'))
  })
})
