import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import extract from 'extract-zip'
import { sha256File } from '../src/shared/hash.js'
import { readProductConfig } from '../src/shared/product-config.js'
import { loadVerifiedRuntimeLayout } from '../src/supervisor/runtime-layout.js'
import { pathExists, projectRoot, removeOwnedPath } from './lib/project.js'
import { verifyRuntimeFileIndex } from './lib/runtime-index.js'
import { verifyAuthenticode } from './lib/signing.js'
import { candidatePaths } from './lib/artifacts.js'

const desktopPackage = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')) as { version?: unknown }
if (typeof desktopPackage.version !== 'string') throw new Error('桌面 package.json 缺少版本。')
const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const candidate = await candidatePaths()
const output = candidate.makeRoot
const setup = resolve(output, `DSH Desktop-${desktopPackage.version} Setup.exe`)
const nupkg = resolve(output, `DshDesktop-${desktopPackage.version}-full.nupkg`)
const releases = resolve(output, 'RELEASES')

for (const artifact of [setup, nupkg, releases]) {
  if (!await pathExists(artifact)) throw new Error(`缺少待验证的发行产物：${artifact}`)
}
await verifyAuthenticode([setup])
const releaseLine = (await readFile(releases, 'utf8')).trim()
const match = /^([0-9A-F]{40}) (\S+) (\d+)$/u.exec(releaseLine)
if (match === null) throw new Error('RELEASES 不符合单一完整包格式。')
const [, expectedSha1, releaseName, expectedSize] = match
if (releaseName !== `DshDesktop-${desktopPackage.version}-full.nupkg`) throw new Error('RELEASES 指向了非预期安装包。')
const nupkgStats = await stat(nupkg)
if (nupkgStats.size !== Number(expectedSize)) throw new Error('RELEASES 中的安装包大小不匹配。')
if ((await hashFile(nupkg, 'sha1')).toUpperCase() !== expectedSha1) throw new Error('RELEASES 中的安装包 SHA-1 不匹配。')

const temporaryOwner = resolve(tmpdir(), 'dsh-desktop-release-verify')
await mkdir(temporaryOwner, { recursive: true })
const temporary = await mkdtemp(resolve(temporaryOwner, 'candidate-'))
try {
  await extract(nupkg, { dir: temporary })
  const appRoot = resolve(temporary, 'lib', 'net45')
  const runtimeRoot = resolve(appRoot, 'resources', '.runtime')
  const layout = await loadVerifiedRuntimeLayout(runtimeRoot, config)
  const index = await verifyRuntimeFileIndex(runtimeRoot)
  await verifyAuthenticode([
    resolve(appRoot, 'dsh-desktop.exe'),
    resolve(runtimeRoot, 'launcher', 'dsh-desktop-launcher.exe'),
  ])
  const artifacts = await Promise.all([setup, nupkg, releases].map(async path => {
    const metadata = await stat(path)
    return {
      name: path.slice(output.length + 1),
      size: metadata.size,
      sha256: await sha256File(path),
    }
  }))
  const manifest = {
    schemaVersion: 1,
    channel: 'candidate',
    desktopVersion: desktopPackage.version,
    harnessVersion: layout.identity.harnessVersion,
    nodeVersion: layout.identity.nodeVersion,
    electronVersion: layout.identity.electronVersion,
    buildId: layout.identity.buildId,
    runtimeFileCount: index.files.length,
    harnessSource: {
      package: config.harness.package,
      integrity: config.harness.integrity,
      tarball: config.harness.tarball,
    },
    signatureVerification: 'authenticode-pa-valid',
    artifacts,
  }
  await writeFile(resolve(output, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`签名发行验证通过：${layout.identity.buildId}`)
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
