import { resolve } from 'node:path'
import { sign } from '@electron/windows-sign'
import { runtimeRoot } from './lib/project.js'
import { releaseSignOptions, verifyAuthenticode } from './lib/signing.js'
import { candidatePaths } from './lib/artifacts.js'

const mode = process.argv[2]
const candidate = await candidatePaths()
const files = mode === 'runtime'
  ? [resolve(runtimeRoot, 'launcher', 'dsh-desktop-launcher.exe')]
  : mode === 'app'
    ? [resolve(candidate.appRoot, 'dsh-desktop.exe')]
    : undefined
if (files === undefined) throw new Error('签名模式必须是 runtime 或 app。')

await sign({ files, ...releaseSignOptions() })
await verifyAuthenticode(files)
console.log(mode === 'runtime' ? 'Windows 启动器签名验证通过。' : '桌面主可执行文件签名验证通过。')
