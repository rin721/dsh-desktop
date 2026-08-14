import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isAllowedNavigation, parseFailureAction } from '../src/main/window-policy.js'

describe('窗口导航白名单', () => {
  const startup = resolve('assets', 'startup.html')
  const failure = resolve('assets', 'failure.html')
  const origin = 'http://127.0.0.1:41234' as const

  it('允许自有本地页面及其查询参数', () => {
    expect(isAllowedNavigation(pathToFileURL(startup).href, undefined, [startup, failure])).toBe(true)
    expect(isAllowedNavigation(`${pathToFileURL(failure).href}?code=test`, undefined, [startup, failure])).toBe(true)
  })

  it('只允许本次就绪的精确环回来源', () => {
    expect(isAllowedNavigation(`${origin}/workspace?id=1`, origin, [startup, failure])).toBe(true)
    expect(isAllowedNavigation('http://127.0.0.1:41235/', origin, [startup, failure])).toBe(false)
    expect(isAllowedNavigation('http://localhost:41234/', origin, [startup, failure])).toBe(false)
    expect(isAllowedNavigation('https://example.com/', origin, [startup, failure])).toBe(false)
    expect(isAllowedNavigation(`${origin.replace('http://', 'http://user@')}/`, origin, [startup, failure])).toBe(false)
  })

  it('拒绝其他文件与无效 URL', () => {
    expect(isAllowedNavigation(pathToFileURL(resolve('package.json')).href, origin, [startup, failure])).toBe(false)
    expect(isAllowedNavigation('not a url', origin, [startup, failure])).toBe(false)
  })

  it('只有本地错误页可以触发固定恢复动作', () => {
    const failureUrl = `${pathToFileURL(failure).href}?code=test`
    expect(parseFailureAction(failureUrl, 'dsh-desktop://retry', failure)).toBe('retry')
    expect(parseFailureAction(failureUrl, 'dsh-desktop://exit', failure)).toBe('exit')
    expect(parseFailureAction(`${origin}/`, 'dsh-desktop://retry', failure)).toBeUndefined()
    expect(parseFailureAction(failureUrl, 'dsh-desktop://other', failure)).toBeUndefined()
    expect(parseFailureAction(failureUrl, 'dsh-desktop://retry?source=remote', failure)).toBeUndefined()
  })
})
