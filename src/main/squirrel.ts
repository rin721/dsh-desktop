import { spawn } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'
import process from 'node:process'
import { app } from 'electron'

/**
 * 处理 Squirrel.Windows 的安装、更新和卸载事件。
 * @returns 当前进程是否属于 Squirrel 维护事件；为 true 时调用方不得启动产品运行时。
 */
export function handleSquirrelStartup(): boolean {
  if (process.platform !== 'win32') return false
  const command = process.argv[1]
  if (command === '--squirrel-obsolete') {
    app.quit()
    return true
  }

  const target = basename(process.execPath)
  if (command === '--squirrel-install' || command === '--squirrel-updated') {
    runUpdate([`--createShortcut=${target}`])
    return true
  }
  if (command === '--squirrel-uninstall') {
    runUpdate([`--removeShortcut=${target}`])
    return true
  }
  return false
}

function runUpdate(arguments_: string[]): void {
  const updateExecutable = resolve(dirname(process.execPath), '..', 'Update.exe')
  const child = spawn(updateExecutable, arguments_, {
    detached: true,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  })
  let finished = false
  const quit = (): void => {
    if (finished) return
    finished = true
    app.quit()
  }
  child.once('error', quit)
  child.once('close', quit)
}
