import { join, resolve } from 'node:path'

/**
 * 按 Harness 的 `$DSH_HOME`、`~/.dsh` 优先级解析子进程实际使用的绝对目录。
 * @param environment - 传给 Harness 子进程的环境。
 * @param userHome - 操作系统用户主目录。
 * @param workingDirectory - Harness 子进程工作目录，用于解析相对覆盖值。
 * @returns Harness 将使用的绝对用户状态目录。
 */
export function resolveHarnessHome(
  environment: NodeJS.ProcessEnv,
  userHome: string,
  workingDirectory: string,
): string {
  const configured = environment.DSH_HOME
  const selected = configured === undefined || configured.trim().length === 0
    ? join(userHome, '.dsh')
    : expandHome(configured, userHome)
  return resolve(workingDirectory, selected)
}

function expandHome(path: string, userHome: string): string {
  if (path === '~') return userHome
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(userHome, path.slice(2))
  return path
}
