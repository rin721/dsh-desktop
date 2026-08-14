import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveHarnessHome } from '../src/shared/harness-home.js'

describe('Harness 用户目录解析', () => {
  const userHome = 'C:\\Users\\测试 用户'
  const workingDirectory = 'D:\\工作 空间'

  it('空覆盖回退到用户主目录下的 .dsh', () => {
    expect(resolveHarnessHome({}, userHome, workingDirectory)).toBe(resolve(userHome, '.dsh'))
    expect(resolveHarnessHome({ DSH_HOME: '   ' }, userHome, workingDirectory)).toBe(resolve(userHome, '.dsh'))
  })

  it('展开波浪号并相对 Harness 工作目录解析覆盖值', () => {
    expect(resolveHarnessHome({ DSH_HOME: '~\\隔离' }, userHome, workingDirectory)).toBe(resolve(userHome, '隔离'))
    expect(resolveHarnessHome({ DSH_HOME: '.dsh-local' }, userHome, workingDirectory))
      .toBe(resolve(workingDirectory, '.dsh-local'))
  })
})
