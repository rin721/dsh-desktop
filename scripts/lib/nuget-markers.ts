import { lstat, readdir, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * 移除 NuGet 为候选中的真实空目录生成的零字节 `_._` 标记。
 * 其他文件、链接或无法与原始候选空目录对应的标记一律拒绝。
 */
export async function removeVerifiedNugetEmptyDirectoryMarkers(
  extractedRoot: string,
  candidateRoot: string,
): Promise<number> {
  const extracted = resolve(extractedRoot)
  const candidate = resolve(candidateRoot)
  let removed = 0

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`NuGet 解包目录不得包含链接：${path}`)
      if (entry.isDirectory()) {
        await visit(path)
        continue
      }
      if (!entry.isFile()) throw new Error(`NuGet 解包目录包含不支持的文件类型：${path}`)
      if (entry.name !== '_._') continue

      const relativePath = relative(extracted, path)
      assertInside(relativePath, path)
      const originalPath = resolve(candidate, relativePath)
      if (await isRegularFile(originalPath)) continue

      const marker = await lstat(path)
      if (marker.size !== 0) throw new Error(`NuGet 空目录标记不是零字节文件：${path}`)
      if (entries.length !== 1) throw new Error(`NuGet 空目录标记所在解包目录并非空目录：${path}`)

      const originalDirectory = resolve(candidate, dirname(relativePath))
      const original = await lstat(originalDirectory)
      if (original.isSymbolicLink() || !original.isDirectory()) {
        throw new Error(`NuGet 空目录标记没有对应的原始普通目录：${path}`)
      }
      if ((await readdir(originalDirectory)).length !== 0) {
        throw new Error(`NuGet 空目录标记对应的原始目录并非空目录：${path}`)
      }
      await unlink(path)
      removed += 1
    }
  }

  await visit(extracted)
  return removed
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const value = await lstat(path)
    if (value.isSymbolicLink()) throw new Error(`原始候选中的 NuGet 标记路径不得是链接：${path}`)
    return value.isFile()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

function assertInside(relation: string, path: string): void {
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`NuGet 标记路径越界：${path}`)
  }
}
