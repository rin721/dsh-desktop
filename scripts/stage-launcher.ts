import { spawn } from 'node:child_process'
import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathExists, projectRoot, removeManagedPath, runtimeRoot } from './lib/project.js'

const manifest = resolve(projectRoot, 'native', 'launcher', 'Cargo.toml')
const source = resolve(projectRoot, 'native', 'launcher', 'target', 'release', 'dsh-desktop-launcher.exe')
const targetRoot = resolve(runtimeRoot, 'launcher')
const target = resolve(targetRoot, 'dsh-desktop-launcher.exe')

await runCargo(['build', '--locked', '--release', '--manifest-path', manifest])
if (!await pathExists(source)) throw new Error(`Cargo 构建成功但缺少启动器：${source}`)

await removeManagedPath(targetRoot)
await mkdir(targetRoot, { recursive: true })
await cp(source, target)
console.log(`Windows 进程托管器已暂存：${target}`)

async function runCargo(arguments_: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('cargo', arguments_, {
      cwd: projectRoot,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`Cargo 构建启动器失败：code=${String(code)} signal=${String(signal)}`))
    })
  })
}
