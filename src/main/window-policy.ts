import { fileURLToPath } from 'node:url'
import { normalize, resolve } from 'node:path'

export type FailureAction = 'retry' | 'exit'

function sameWindowsPath(left: string, right: string): boolean {
  return normalize(resolve(left)).toLocaleLowerCase('en-US') === normalize(resolve(right)).toLocaleLowerCase('en-US')
}

/**
 * 只允许桌面自有静态页面和本次启动后固定的 Harness 环回来源。
 * @param targetUrl - renderer 即将导航到的完整 URL。
 * @param harnessOrigin - 通过监管器探测后固定的来源；启动前为空。
 * @param localPages - 桌面自有页面的绝对路径。
 */
export function isAllowedNavigation(
  targetUrl: string,
  harnessOrigin: `http://127.0.0.1:${number}` | undefined,
  localPages: readonly string[],
): boolean {
  let target: URL
  try {
    target = new URL(targetUrl)
  } catch {
    return false
  }

  if (target.protocol === 'file:') {
    let path: string
    try {
      path = fileURLToPath(target)
    } catch {
      return false
    }
    return localPages.some(localPage => sameWindowsPath(path, localPage))
  }

  if (harnessOrigin === undefined || target.protocol !== 'http:') return false
  return target.origin === harnessOrigin
    && target.hostname === '127.0.0.1'
    && target.username === ''
    && target.password === ''
}

/** 只接受从当前本地错误页发出的固定恢复动作。 */
export function parseFailureAction(currentUrl: string, targetUrl: string, failurePage: string): FailureAction | undefined {
  let current: URL
  let target: URL
  try {
    current = new URL(currentUrl)
    target = new URL(targetUrl)
    if (current.protocol !== 'file:' || !sameWindowsPath(fileURLToPath(current), failurePage)) return undefined
  } catch {
    return undefined
  }
  if (target.protocol !== 'dsh-desktop:' || target.username !== '' || target.password !== ''
    || target.port !== '' || target.pathname !== '' || target.search !== '' || target.hash !== '') return undefined
  if (target.hostname === 'retry') return 'retry'
  if (target.hostname === 'exit') return 'exit'
  return undefined
}
