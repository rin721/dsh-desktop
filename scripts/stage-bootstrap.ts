import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathExists, projectRoot, removeManagedPath, runtimeRoot } from './lib/project.js'

const bootstrapSource = resolve(projectRoot, 'dist', 'bootstrap', 'supervisor-bootstrap.js')
const protocolSource = resolve(projectRoot, 'dist', 'bootstrap', 'protocol.js')
const bootstrapRoot = resolve(runtimeRoot, 'bootstrap')
for (const source of [bootstrapSource, protocolSource]) {
  if (!await pathExists(source)) throw new Error(`桌面构建缺少 bootstrap 文件：${source}`)
}

await removeManagedPath(bootstrapRoot)
await mkdir(bootstrapRoot, { recursive: true })
await cp(bootstrapSource, resolve(bootstrapRoot, 'supervisor-bootstrap.js'))
await cp(protocolSource, resolve(bootstrapRoot, 'protocol.js'))
console.log('桌面监管 bootstrap 已暂存。')
