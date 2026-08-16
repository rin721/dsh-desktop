import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { iconAssetsRoot, windowsIconPath } from './lib/icon-assets.js'

const expectedPngSizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 192, 256, 512, 1024]
const expectedIcoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const iconRoot = iconAssetsRoot
const manifestPath = resolve(iconRoot, 'icon-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>

if (manifest.schemaVersion !== 1 || manifest.source !== 'app-icon-master.png') {
  throw new Error('图标资源清单版本或母版路径无效。')
}
assertNumberList(manifest.pngSizes, expectedPngSizes, 'PNG 尺寸')
assertNumberList(manifest.icoSizes, expectedIcoSizes, 'ICO 尺寸')
const source = resolve(iconRoot, String(manifest.source))
if (manifest.sourceSha256 !== await sha256(source)) throw new Error('图标透明母版哈希不匹配。')

const files = manifest.files
if (!Array.isArray(files)) throw new Error('图标资源清单缺少 files。')
const expectedFiles = [
  'app-icon-contact-sheet.png',
  'app-icon.ico',
  ...expectedPngSizes.map(size => `png/app-icon-${size}.png`),
].sort()
const actualFiles: string[] = []
for (const raw of files) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('图标资源文件记录无效。')
  const record = raw as Record<string, unknown>
  if (typeof record.path !== 'string' || typeof record.bytes !== 'number' || typeof record.sha256 !== 'string') {
    throw new Error('图标资源文件字段无效。')
  }
  const path = resolve(iconRoot, record.path)
  const content = await readFile(path)
  if (content.byteLength !== record.bytes) throw new Error(`图标资源大小不匹配：${record.path}`)
  if (createHash('sha256').update(content).digest('hex') !== record.sha256) {
    throw new Error(`图标资源哈希不匹配：${record.path}`)
  }
  actualFiles.push(record.path)
}
assertStringList(actualFiles.sort(), expectedFiles, '图标资源文件')

for (const size of expectedPngSizes) {
  const dimensions = await readPngHeader(resolve(iconRoot, 'png', `app-icon-${size}.png`))
  if (dimensions.width !== size || dimensions.height !== size || dimensions.colorType !== 6) {
    throw new Error(`PNG 图标尺寸或色彩类型无效：${size}`)
  }
}
const icoSizes = await readIcoSizes(windowsIconPath)
assertNumberList(icoSizes, expectedIcoSizes, 'ICO 实际帧')
console.log(`图标资源验证通过：${expectedPngSizes.length} 个 PNG 尺寸，${expectedIcoSizes.length} 个 ICO 帧。`)

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function readPngHeader(path: string): Promise<{ width: number; height: number; colorType: number }> {
  const content = await readFile(path)
  if (content.length < 26 || content.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || content.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`不是有效 PNG：${path}`)
  return { width: content.readUInt32BE(16), height: content.readUInt32BE(20), colorType: content[25] ?? -1 }
}

async function readIcoSizes(path: string): Promise<number[]> {
  const content = await readFile(path)
  if (content.length < 6 || content.readUInt16LE(0) !== 0 || content.readUInt16LE(2) !== 1) {
    throw new Error('Windows ICO 头无效。')
  }
  const count = content.readUInt16LE(4)
  if (content.length < 6 + count * 16) throw new Error('Windows ICO 目录被截断。')
  return Array.from({ length: count }, (_value, index) => content[6 + index * 16] || 256)
}

function assertNumberList(actual: unknown, expected: readonly number[], label: string): void {
  if (!Array.isArray(actual) || actual.length !== expected.length
    || actual.some((value, index) => value !== expected[index])) throw new Error(`${label} 不匹配。`)
}

function assertStringList(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} 不匹配。`)
  }
}
