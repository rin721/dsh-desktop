import { describe, expect, it } from 'vitest'
import { DiagnosticBuffer, redactDiagnostic } from '../src/supervisor/diagnostics.js'

describe('诊断脱敏与边界', () => {
  it('移除常见凭据而保留错误上下文', () => {
    const redacted = redactDiagnostic('API_KEY=alpha Bearer beta sk-1234567890 password:gamma failure')
    expect(redacted).toContain('API_KEY=[REDACTED]')
    expect(redacted).toContain('Bearer [REDACTED]')
    expect(redacted).toContain('sk-[REDACTED]')
    expect(redacted).toContain('password=[REDACTED]')
    expect(redacted).toContain('failure')
    expect(redacted).not.toContain('alpha')
    expect(redacted).not.toContain('beta')
    expect(redacted).not.toContain('1234567890')
    expect(redacted).not.toContain('gamma')
  })

  it('对跨数据块凭据再次脱敏', () => {
    const buffer = new DiagnosticBuffer(1024)
    buffer.append('token=abcdef')
    buffer.append('ghijkl next sk-12345678')
    buffer.append('90 done')
    expect(buffer.text()).not.toContain('abcdefghijkl')
    expect(buffer.text()).not.toContain('1234567890')
    expect(buffer.text()).not.toContain('ghijkl')
  })

  it('隐藏原始、正斜杠和 JSON 转义形式的 Harness 用户目录', () => {
    const root = 'C:\\Users\\测试 用户\\.dsh'
    const text = [
      `${root}\\sessions\\private.json`,
      `${root.replaceAll('\\', '/')} /sessions/private.json`,
      JSON.stringify({ path: `${root}\\credentials.yaml` }),
    ].join('\n')
    const redacted = redactDiagnostic(text, [root])
    expect(redacted).not.toContain('测试 用户')
    expect(redacted).not.toContain('credentials.yaml')
    expect(redacted.match(/\$DSH_HOME/gu)).toHaveLength(3)
  })

  it('按 UTF-8 字节保留合法尾部', () => {
    const buffer = new DiagnosticBuffer(8)
    buffer.append('前缀abcdef')
    expect(Buffer.byteLength(buffer.text(), 'utf8')).toBeLessThanOrEqual(8)
    expect(buffer.text()).not.toContain('\uFFFD')
    expect(buffer.text()).toBe('abcdef')
  })
})
