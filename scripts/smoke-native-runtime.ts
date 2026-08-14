import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { readProductConfig } from '../src/shared/product-config.js'
import { projectRoot, runtimeRoot } from './lib/project.js'

const execFileAsync = promisify(execFile)
const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const node = resolve(runtimeRoot, 'node', config.node.archive.slice(0, -4), 'node.exe')
const harnessRoot = resolve(runtimeRoot, 'harness')
const probe = String.raw`
const koffi = require('koffi')
const pty = require('node-pty')
if (koffi.sizeof('void *') !== 8) throw new Error('koffi 指针宽度不是 x64')
const terminal = pty.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'echo DSH_NATIVE_OK'], {
  cwd: process.cwd(),
  env: process.env,
  cols: 80,
  rows: 24,
})
let output = ''
const deadline = setTimeout(() => { terminal.kill(); process.exit(2) }, 10000)
terminal.onData(data => { output += data })
terminal.onExit(event => {
  clearTimeout(deadline)
  if (event.exitCode !== 0 || !output.includes('DSH_NATIVE_OK')) process.exit(3)
  process.stdout.write('native-ok', () => process.exit(0))
})
`
const environment = { ...process.env }
delete environment.NODE_OPTIONS
delete environment.ELECTRON_RUN_AS_NODE
const { stdout, stderr } = await execFileAsync(node, ['-e', probe], {
  cwd: harnessRoot,
  env: environment,
  windowsHide: true,
  timeout: 30000,
  maxBuffer: 1024 * 1024,
})
if (stdout !== 'native-ok' || stderr.length !== 0) {
  throw new Error(`原生运行时冒烟结果异常：stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`)
}
console.log('独立 Node.js 的 node-pty 与 koffi 原生模块冒烟通过。')
