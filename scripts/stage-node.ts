import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import extract from 'extract-zip'
import { sha256File } from '../src/shared/hash.js'
import { readProductConfig } from '../src/shared/product-config.js'
import { buildCacheRoot, pathExists, projectRoot, removeManagedPath, removeOwnedPath, runtimeRoot } from './lib/project.js'

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'error' })
  if (!response.ok) throw new Error(`下载 ${url} 失败：HTTP ${response.status}`)
  return response.text()
}

async function download(url: string, target: string): Promise<void> {
  const response = await fetch(url, { redirect: 'error' })
  if (!response.ok) throw new Error(`下载 ${url} 失败：HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  await writeFile(target, bytes, { flag: 'wx', mode: 0o600 })
}

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const archiveUrl = `${config.node.baseUrl}/${config.node.archive}`
const checksumsUrl = `${config.node.baseUrl}/SHASUMS256.txt`
const checksums = await fetchText(checksumsUrl)
const checksumLine = checksums.split(/\r?\n/u).find(line => line.endsWith(`  ${config.node.archive}`))
if (checksumLine === undefined) throw new Error(`官方 SHASUMS256.txt 缺少 ${config.node.archive}。`)
const expectedSha256 = checksumLine.slice(0, 64).toLowerCase()
if (!/^[0-9a-f]{64}$/u.test(expectedSha256)) throw new Error('官方 Node.js SHA-256 行格式无效。')

const cacheRoot = resolve(buildCacheRoot, 'node')
await mkdir(cacheRoot, { recursive: true })
const archive = resolve(cacheRoot, config.node.archive)
const legacyDownloads = resolve(runtimeRoot, 'downloads')
const legacyArchive = resolve(legacyDownloads, config.node.archive)
if (!await pathExists(archive) && await pathExists(legacyArchive) && await sha256File(legacyArchive) === expectedSha256) {
  await rename(legacyArchive, archive)
}
if (await pathExists(legacyDownloads)) await removeManagedPath(legacyDownloads)
if (await pathExists(archive) && await sha256File(archive) !== expectedSha256) {
  await removeOwnedPath(archive, buildCacheRoot)
}
if (!await pathExists(archive)) {
  const temporaryArchive = resolve(cacheRoot, `${config.node.archive}.${randomUUID()}.tmp`)
  try {
    await download(archiveUrl, temporaryArchive)
    const actual = await sha256File(temporaryArchive)
    if (actual !== expectedSha256) throw new Error(`Node.js archive SHA-256 不匹配：${actual}`)
    await rename(temporaryArchive, archive)
  } finally {
    if (await pathExists(temporaryArchive)) await removeOwnedPath(temporaryArchive, buildCacheRoot)
  }
}

const actualArchiveSha256 = await sha256File(archive)
if (actualArchiveSha256 !== expectedSha256) throw new Error('缓存的 Node.js archive 未通过最终 SHA-256 校验。')

const folderName = config.node.archive.slice(0, -4)
const target = resolve(runtimeRoot, 'node', folderName)
const extractionRoot = resolve(runtimeRoot, 'node', `.extract-${randomUUID()}`)
await mkdir(extractionRoot, { recursive: true })
try {
  await extract(archive, { dir: extractionRoot })
  const extracted = resolve(extractionRoot, folderName)
  const nodeExecutable = resolve(extracted, 'node.exe')
  const license = resolve(extracted, 'LICENSE')
  if (!await pathExists(nodeExecutable) || !await pathExists(license)) {
    throw new Error('Node.js archive 缺少 node.exe 或 LICENSE。')
  }
  await removeManagedPath(target)
  await rename(extracted, target)
} finally {
  if (await pathExists(extractionRoot)) await removeManagedPath(extractionRoot)
}

// 再读一次可执行文件，确保最终路径不是空目录或移动失败后的残留。
await readFile(resolve(target, 'node.exe'))
console.log(`Node.js runtime staged: v${config.node.version} sha256=${expectedSha256}`)
