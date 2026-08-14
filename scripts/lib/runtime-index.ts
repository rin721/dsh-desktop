import { lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { sha256File } from '../../src/shared/hash.js'

export interface RuntimeFileEntry {
  path: string
  size: number
  sha256: string
}

interface RuntimeFileIndex {
  schemaVersion: 1
  files: RuntimeFileEntry[]
}

const excluded = new Set(['runtime-files.json', 'runtime-manifest.json'])

/** 为完整运行时生成稳定的相对路径、大小与 SHA-256 索引。 */
export async function writeRuntimeFileIndex(runtimeRoot: string): Promise<RuntimeFileIndex> {
  const paths = await enumerateFiles(runtimeRoot)
  const files = await mapConcurrent(paths, 8, async path => {
    const stats = await lstat(path)
    return {
      path: portable(relative(runtimeRoot, path)),
      size: stats.size,
      sha256: await sha256File(path),
    }
  })
  files.sort((left, right) => left.path.localeCompare(right.path))
  const index: RuntimeFileIndex = { schemaVersion: 1, files }
  await writeFile(resolve(runtimeRoot, 'runtime-files.json'), `${JSON.stringify(index)}\n`, 'utf8')
  return index
}

/** 验证运行时不存在缺失、额外、大小变化或内容哈希变化。 */
export async function verifyRuntimeFileIndex(runtimeRoot: string): Promise<RuntimeFileIndex> {
  const raw = JSON.parse(await readFile(resolve(runtimeRoot, 'runtime-files.json'), 'utf8')) as unknown
  const index = parseIndex(raw)
  const actualPaths = await enumerateFiles(runtimeRoot)
  const actualRelative = new Set(actualPaths.map(path => portable(relative(runtimeRoot, path))))
  const expected = new Set(index.files.map(entry => entry.path))
  for (const path of expected) if (!actualRelative.has(path)) throw new Error(`运行时索引文件缺失：${path}`)
  for (const path of actualRelative) if (!expected.has(path)) throw new Error(`运行时索引出现额外文件：${path}`)
  await mapConcurrent(index.files, 8, async entry => {
    const path = resolveIndexedPath(runtimeRoot, entry.path)
    const stats = await lstat(path)
    if (stats.size !== entry.size) throw new Error(`运行时文件大小不匹配：${entry.path}`)
    if (await sha256File(path) !== entry.sha256) throw new Error(`运行时文件 SHA-256 不匹配：${entry.path}`)
  })
  return index
}

function parseIndex(value: unknown): RuntimeFileIndex {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('runtime-files.json 必须是对象。')
  const root = value as Record<string, unknown>
  if (root.schemaVersion !== 1 || !Array.isArray(root.files)) throw new TypeError('runtime-files.json 结构无效。')
  const seen = new Set<string>()
  const files = root.files.map((value, index) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`运行时索引第 ${index} 项必须是对象。`)
    const entry = value as Record<string, unknown>
    if (typeof entry.path !== 'string' || entry.path.length === 0) throw new TypeError(`运行时索引第 ${index} 项 path 无效。`)
    if (!Number.isSafeInteger(entry.size) || (entry.size as number) < 0) throw new TypeError(`运行时索引第 ${index} 项 size 无效。`)
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(entry.sha256)) throw new TypeError(`运行时索引第 ${index} 项 sha256 无效。`)
    resolveIndexedPath('.', entry.path)
    if (seen.has(entry.path)) throw new TypeError(`运行时索引路径重复：${entry.path}`)
    seen.add(entry.path)
    return { path: entry.path, size: entry.size as number, sha256: entry.sha256 }
  })
  return { schemaVersion: 1, files }
}

async function enumerateFiles(root: string): Promise<string[]> {
  const files: string[] = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`运行时不得包含符号链接或目录联接：${path}`)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) {
        const relativePath = portable(relative(root, path))
        if (!excluded.has(relativePath)) files.push(path)
      } else throw new Error(`运行时包含不支持的文件类型：${path}`)
    }
  }
  await visit(root)
  return files
}

function resolveIndexedPath(root: string, path: string): string {
  if (isAbsolute(path) || path.includes('\\') || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(`运行时索引路径不安全：${path}`)
  }
  const resolved = resolve(root, ...path.split('/'))
  const relation = relative(resolve(root), resolved)
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new TypeError(`运行时索引路径越界：${path}`)
  }
  return resolved
}

function portable(path: string): string {
  return path.split(sep).join('/')
}

async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const output: R[] = []
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor++
      const value = values[index]
      if (value === undefined) continue
      output[index] = await mapper(value)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()))
  return output
}
