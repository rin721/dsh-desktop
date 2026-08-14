import { spawn } from 'node:child_process'

/**
 * 运行当前 pnpm 入口并把输出直接交给调用终端。
 * @param args - 传递给 pnpm 的参数。
 * @param cwd - 子进程工作目录。
 */
export async function runPnpm(args: string[], cwd: string): Promise<void> {
  const pnpmEntrypoint = process.env.npm_execpath
  if (pnpmEntrypoint === undefined || pnpmEntrypoint.length === 0) {
    throw new Error('缺少 npm_execpath；请通过 pnpm run 执行暂存脚本。')
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmEntrypoint, ...args], {
      cwd,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`pnpm ${args.join(' ')} 失败：code=${String(code)} signal=${String(signal)}`))
    })
  })
}

