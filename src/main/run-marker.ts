import { lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface PreviousRunMarker {
  startedAt?: string
  processId?: number
  valid: boolean
}

interface RunMarkerRecord {
  schemaVersion: 1
  startedAt: string
  processId: number
}

const maxMarkerBytes = 4096

/**
 * 读取上一运行标记并用当前进程标记替换；固定文件不含环境或用户数据。
 * @param path - 应用 userData 目录下的固定标记文件。
 * @param processId - 当前 Electron 主进程 PID。
 * @param now - 当前启动时间，测试可提供固定值。
 * @returns 上一标记摘要；不存在时返回 undefined。
 */
export async function beginRunMarker(
  path: string,
  processId: number,
  now: Date = new Date(),
): Promise<PreviousRunMarker | undefined> {
  if (!Number.isSafeInteger(processId) || processId <= 0) throw new TypeError('运行标记 PID 必须是正整数。')
  await mkdir(dirname(path), { recursive: true })
  const previous = await readExistingMarker(path)
  if (previous !== undefined) await removeOrdinaryMarker(path)
  const current: RunMarkerRecord = { schemaVersion: 1, startedAt: now.toISOString(), processId }
  await writeFile(path, `${JSON.stringify(current)}\n`, { encoding: 'utf8', flag: 'wx' })
  return previous
}

/** @param path - 仅在当前进程成功创建后删除的固定标记文件。 */
export async function clearRunMarker(path: string): Promise<void> {
  try {
    await removeOrdinaryMarker(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
}

async function readExistingMarker(path: string): Promise<PreviousRunMarker | undefined> {
  let metadata
  try {
    metadata = await lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error('运行标记路径必须是普通文件。')
  if (metadata.size > maxMarkerBytes) return { valid: false }
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { valid: false }
    const record = raw as Record<string, unknown>
    if (record.schemaVersion !== 1
      || typeof record.startedAt !== 'string' || Number.isNaN(Date.parse(record.startedAt))
      || typeof record.processId !== 'number' || !Number.isSafeInteger(record.processId) || record.processId <= 0) {
      return { valid: false }
    }
    return { startedAt: record.startedAt, processId: record.processId, valid: true }
  } catch {
    // 标记只由本模块写入；截断或手工修改统一报告为无效，不回显原始内容。
    return { valid: false }
  }
}

async function removeOrdinaryMarker(path: string): Promise<void> {
  const metadata = await lstat(path)
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error('拒绝删除非普通运行标记文件。')
  await unlink(path)
}
