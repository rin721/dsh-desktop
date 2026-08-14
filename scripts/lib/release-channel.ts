import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { sha256File } from '../../src/shared/hash.js'
import { pathExists, removeOwnedPath } from './project.js'
import { verifyAuthenticode } from './signing.js'

export interface ReleasePointer {
  schemaVersion: 1
  desktopVersion: string
  buildId: string
  manifestPath: string
  manifestSha256: string
}

export interface ReleaseChannelState {
  schemaVersion: 1
  stable: ReleasePointer
  previous?: ReleasePointer
}

export async function pointerForManifest(outRoot: string, manifestPath: string): Promise<ReleasePointer> {
  const manifest = await parseReleaseManifest(manifestPath)
  return {
    schemaVersion: 1,
    desktopVersion: manifest.desktopVersion,
    buildId: manifest.buildId,
    manifestPath: portable(relative(outRoot, manifestPath)),
    manifestSha256: await sha256File(manifestPath),
  }
}

/** 重新校验通道指针、发行清单、产物摘要和安装器签名。 */
export async function verifyReleasePointer(outRoot: string, pointer: ReleasePointer): Promise<void> {
  parsePointer(pointer)
  const manifestPath = resolveContained(outRoot, pointer.manifestPath)
  if (await sha256File(manifestPath) !== pointer.manifestSha256) throw new Error('通道发行清单 SHA-256 不匹配。')
  const manifest = await parseReleaseManifest(manifestPath)
  if (manifest.buildId !== pointer.buildId || manifest.desktopVersion !== pointer.desktopVersion) {
    throw new Error('通道指针与发行清单身份不一致。')
  }
  const directory = dirname(manifestPath)
  for (const artifact of manifest.artifacts) {
    const path = resolve(directory, artifact.name)
    if (basename(path) !== artifact.name) throw new Error(`发行产物名称不安全：${artifact.name}`)
    if (await sha256File(path) !== artifact.sha256) throw new Error(`发行产物 SHA-256 不匹配：${artifact.name}`)
  }
  const setup = manifest.artifacts.find(artifact => artifact.name.endsWith(' Setup.exe'))
  if (setup === undefined) throw new Error('发行清单缺少签名 Setup.exe。')
  await verifyAuthenticode([resolve(directory, setup.name)])
}

export async function readReleaseChannelState(path: string): Promise<ReleaseChannelState> {
  const value = JSON.parse(await readFile(path, 'utf8')) as ReleaseChannelState
  parseChannelState(value)
  return value
}

/** 以单文件原子替换同时提交 stable 与 previous，避免两文件交换中断。 */
export async function writeReleaseChannelState(path: string, state: ReleaseChannelState, owner: string): Promise<void> {
  parseChannelState(state)
  const temporary = resolve(dirname(path), `.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
  } finally {
    if (await pathExists(temporary)) await removeOwnedPath(temporary, owner)
  }
}

function parseChannelState(state: ReleaseChannelState): void {
  if (state.schemaVersion !== 1 || typeof state.stable !== 'object' || state.stable === null) {
    throw new Error('发行通道状态结构无效。')
  }
  parsePointer(state.stable)
  if (state.previous !== undefined) parsePointer(state.previous)
  if (state.previous?.buildId === state.stable.buildId) throw new Error('stable 与 previous 不得指向同一构建。')
}

interface ReleaseManifest {
  desktopVersion: string
  buildId: string
  artifacts: Array<{ name: string; sha256: string }>
}

async function parseReleaseManifest(path: string): Promise<ReleaseManifest> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  if (raw.schemaVersion !== 1 || raw.signatureVerification !== 'authenticode-pa-valid') throw new Error('发行清单没有通过签名门禁。')
  if (typeof raw.desktopVersion !== 'string' || typeof raw.buildId !== 'string' || !/^[0-9a-f]{64}$/u.test(raw.buildId)) {
    throw new Error('发行清单身份无效。')
  }
  if (!Array.isArray(raw.artifacts)) throw new Error('发行清单缺少 artifacts。')
  const seen = new Set<string>()
  const artifacts = raw.artifacts.map(value => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('发行产物条目无效。')
    const artifact = value as Record<string, unknown>
    if (typeof artifact.name !== 'string' || basename(artifact.name) !== artifact.name) throw new Error('发行产物名称无效。')
    if (typeof artifact.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(artifact.sha256)) throw new Error('发行产物 SHA-256 无效。')
    if (seen.has(artifact.name)) throw new Error(`发行产物名称重复：${artifact.name}`)
    seen.add(artifact.name)
    return { name: artifact.name, sha256: artifact.sha256 }
  })
  if (artifacts.length !== 3 || !artifacts.some(artifact => artifact.name === 'RELEASES')
    || !artifacts.some(artifact => artifact.name.endsWith('-full.nupkg'))
    || !artifacts.some(artifact => artifact.name.endsWith(' Setup.exe'))) {
    throw new Error('发行清单必须精确包含 Setup.exe、完整 nupkg 和 RELEASES。')
  }
  return { desktopVersion: raw.desktopVersion, buildId: raw.buildId, artifacts }
}

function parsePointer(pointer: ReleasePointer): void {
  if (pointer.schemaVersion !== 1 || typeof pointer.desktopVersion !== 'string' || !/^[0-9a-f]{64}$/u.test(pointer.buildId)
    || typeof pointer.manifestPath !== 'string' || !/^[0-9a-f]{64}$/u.test(pointer.manifestSha256)) {
    throw new Error('发行通道指针结构无效。')
  }
  resolveContained('.', pointer.manifestPath)
}

function resolveContained(root: string, path: string): string {
  if (isAbsolute(path) || path.includes('\\') || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`发行通道路径不安全：${path}`)
  }
  const resolved = resolve(root, ...path.split('/'))
  const relation = relative(resolve(root), resolved)
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new Error('发行通道路径越界。')
  return resolved
}

function portable(path: string): string {
  return path.split(sep).join('/')
}
