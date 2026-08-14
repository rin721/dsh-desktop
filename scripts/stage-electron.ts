import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { sha256File } from '../src/shared/hash.js'
import { readProductConfig } from '../src/shared/product-config.js'
import { buildCacheRoot, pathExists, projectRoot, removeOwnedPath } from './lib/project.js'

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const electronRoot = resolve(buildCacheRoot, 'electron')
const archive = resolve(electronRoot, config.electron.archive)
await mkdir(electronRoot, { recursive: true })
if (await pathExists(archive) && await sha256File(archive) !== config.electron.win32X64ZipSha256) {
  await removeOwnedPath(archive, buildCacheRoot)
}
if (!await pathExists(archive)) {
  const temporary = resolve(electronRoot, `${config.electron.archive}.${randomUUID()}.tmp`)
  try {
    const source = process.env.DSH_DESKTOP_ELECTRON_ARCHIVE
    if (source === undefined || source.length === 0) await download(`${config.electron.baseUrl}/${config.electron.archive}`, temporary)
    else {
      if (!isAbsolute(source)) throw new Error('DSH_DESKTOP_ELECTRON_ARCHIVE 必须是绝对路径。')
      const stats = await lstat(source)
      if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Electron 本地发行包必须是普通文件。')
      await cp(source, temporary, { force: false, errorOnExist: true })
    }
    if (await sha256File(temporary) !== config.electron.win32X64ZipSha256) throw new Error('Electron ZIP SHA-256 不匹配。')
    await rename(temporary, archive)
  } finally {
    if (await pathExists(temporary)) await removeOwnedPath(temporary, buildCacheRoot)
  }
}
if (await sha256File(archive) !== config.electron.win32X64ZipSha256) throw new Error('缓存的 Electron ZIP 未通过最终 SHA-256 校验。')
console.log(`Electron 发行包已暂存并校验：${config.electron.archive}`)

async function download(url: string, target: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`下载 Electron 失败：HTTP ${response.status}`)
  await writeFile(target, new Uint8Array(await response.arrayBuffer()), { flag: 'wx', mode: 0o600 })
}
