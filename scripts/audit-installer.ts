import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import extract from 'extract-zip'
import { sha256File } from '../src/shared/hash.js'
import { readProductConfig } from '../src/shared/product-config.js'
import { loadVerifiedRuntimeLayout } from '../src/supervisor/runtime-layout.js'
import { candidatePaths } from './lib/artifacts.js'
import { removeVerifiedNugetEmptyDirectoryMarkers } from './lib/nuget-markers.js'
import { pathExists, projectRoot, removeOwnedPath } from './lib/project.js'
import { verifyRuntimeFileIndex } from './lib/runtime-index.js'

const candidate = await candidatePaths()
const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const setup = resolve(candidate.makeRoot, `DSH Desktop-${candidate.desktopVersion} Setup.exe`)
const nupkg = resolve(candidate.makeRoot, `DshDesktop-${candidate.desktopVersion}-full.nupkg`)
const releases = resolve(candidate.makeRoot, 'RELEASES')
for (const artifact of [setup, nupkg, releases]) {
  if (!await pathExists(artifact)) throw new Error(`缺少待审计的内部安装器产物：${artifact}`)
}

const releaseLine = (await readFile(releases, 'utf8')).trim()
const match = /^([0-9A-F]{40}) (\S+) (\d+)$/u.exec(releaseLine)
if (match === null) throw new Error('RELEASES 不符合单个完整包格式。')
const [, expectedSha1, releaseName, expectedSize] = match
if (releaseName !== `DshDesktop-${candidate.desktopVersion}-full.nupkg`) throw new Error('RELEASES 指向了非预期安装包。')
const nupkgStats = await stat(nupkg)
if (nupkgStats.size !== Number(expectedSize)) throw new Error('RELEASES 中的安装包大小不匹配。')
if ((await hashFile(nupkg, 'sha1')).toUpperCase() !== expectedSha1) throw new Error('RELEASES 中的安装包 SHA-1 不匹配。')

const temporaryOwner = resolve(tmpdir(), 'dsh-desktop-installer-audit')
await mkdir(temporaryOwner, { recursive: true })
const temporary = await mkdtemp(resolve(temporaryOwner, 'candidate-'))
try {
  await extract(nupkg, { dir: temporary })
  const appRoot = resolve(temporary, 'lib', 'net45')
  const runtimeRoot = resolve(appRoot, 'resources', '.runtime')
  const markerCount = await removeVerifiedNugetEmptyDirectoryMarkers(
    runtimeRoot,
    resolve(candidate.appRoot, 'resources', '.runtime'),
  )
  const layout = await loadVerifiedRuntimeLayout(runtimeRoot, config)
  const index = await verifyRuntimeFileIndex(runtimeRoot)
  if (layout.identity.buildId !== candidate.buildId) throw new Error('安装器内构建标识与不可变候选目录不一致。')
  for (const executable of [
    resolve(appRoot, 'dsh-desktop.exe'),
    resolve(runtimeRoot, 'launcher', 'dsh-desktop-launcher.exe'),
  ]) {
    const metadata = await stat(executable)
    if (!metadata.isFile() || metadata.size === 0) throw new Error(`安装器缺少有效可执行文件：${executable}`)
  }
  const artifacts = await Promise.all([setup, nupkg, releases].map(async path => {
    const metadata = await stat(path)
    return { name: path.slice(candidate.makeRoot.length + 1), size: metadata.size, sha256: await sha256File(path) }
  }))
  const report = {
    schemaVersion: 1,
    productionRelease: false,
    signatureVerification: '未执行：内部候选不得作为生产发行。',
    desktopVersion: candidate.desktopVersion,
    harnessVersion: layout.identity.harnessVersion,
    nodeVersion: layout.identity.nodeVersion,
    electronVersion: layout.identity.electronVersion,
    buildId: layout.identity.buildId,
    runtimeFileCount: index.files.length,
    normalizedNugetEmptyDirectoryMarkers: markerCount,
    artifacts,
  }
  await writeFile(resolve(candidate.makeRoot, 'internal-installer-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`内部安装器结构审计通过：${layout.identity.buildId}，${index.files.length} 个运行时文件。`)
} finally {
  await removeOwnedPath(temporary, temporaryOwner)
}

async function hashFile(path: string, algorithm: 'sha1'): Promise<string> {
  const hash = createHash(algorithm)
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolvePromise)
  })
  return hash.digest('hex')
}
