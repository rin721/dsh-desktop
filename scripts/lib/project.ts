import { access, lstat, mkdir, readdir, rm, rmdir, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 桌面仓库的绝对根路径。 */
export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** `.runtime` 可再生产物目录。 */
export const runtimeRoot = resolve(projectRoot, '.runtime')

/** 可校验后复用、但不进入安装包的构建下载缓存。 */
export const buildCacheRoot = resolve(projectRoot, '.build-cache')

/**
 * 确认目标严格位于指定受管目录内，防止空值或路径穿越扩大删除范围。
 * @param target - 即将修改的绝对目标路径。
 * @param owner - 允许包含目标的绝对受管目录。
 */
export function assertManagedPath(target: string, owner = runtimeRoot): void {
  if (!isAbsolute(target) || !isAbsolute(owner)) throw new TypeError('受管路径必须是绝对路径。')
  const relation = relative(owner, target)
  if (relation === '' || relation === '..' || relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(relation)) {
    throw new Error(`拒绝修改受管目录外的路径：${target}`)
  }
}

/**
 * 删除一个已经验证的可再生路径；不存在时保持幂等。
 * @param target - `.runtime` 下的具体文件或目录。
 */
export async function removeManagedPath(target: string): Promise<void> {
  await removeOwnedPath(target, runtimeRoot)
}

/**
 * 删除指定受管目录内的一个具体可再生路径。
 * @param target - 要删除的绝对文件或目录。
 * @param owner - 允许包含目标的绝对受管目录。
 */
export async function removeOwnedPath(target: string, owner: string): Promise<void> {
  assertManagedPath(target, owner)
  let stats
  try {
    stats = await lstat(target)
    if (stats.isSymbolicLink()) throw new Error(`拒绝删除符号链接或目录联接：${target}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (stats.isDirectory()) await assertNoLinksInTree(target)
  await rm(target, { recursive: true, force: true })
}

/**
 * 删除测试自己创建的临时树；内部链接只解除链接本身，绝不解析或遍历目标。
 * 构建产物不得使用此函数，以免把意外链接降级为可接受状态。
 */
export async function removeEphemeralTree(target: string, owner: string): Promise<void> {
  assertManagedPath(target, owner)
  let stats
  try {
    stats = await lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`临时清理根必须是普通目录：${target}`)
  await removeEphemeralDirectory(target)
}

async function removeEphemeralDirectory(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    const stats = await lstat(path)
    if (stats.isSymbolicLink()) await unlink(path)
    else if (stats.isDirectory()) await removeEphemeralDirectory(path)
    else if (stats.isFile()) await unlink(path)
    else throw new Error(`临时目录包含不支持的文件类型：${path}`)
  }
  await rmdir(directory)
}

async function assertNoLinksInTree(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    const stats = await lstat(path)
    if (stats.isSymbolicLink()) throw new Error(`拒绝递归删除包含符号链接或目录联接的目录：${path}`)
    if (stats.isDirectory()) await assertNoLinksInTree(path)
  }
}

/**
 * 创建目标的父目录。
 * @param target - 需要父目录的绝对路径。
 */
export async function ensureParent(target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
}

/**
 * 判断路径当前是否可访问。
 * @param path - 待检查的绝对路径。
 * @returns 路径存在且可访问时为 true。
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return false
    throw error
  }
}
