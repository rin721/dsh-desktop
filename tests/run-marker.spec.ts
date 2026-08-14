import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { beginRunMarker, clearRunMarker } from '../src/main/run-marker.js'
import { removeOwnedPath } from '../scripts/lib/project.js'

const owner = resolve(tmpdir(), 'dsh-desktop-run-marker-tests')
const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await removeOwnedPath(root, owner)
})

describe('桌面运行标记', () => {
  it('正常清理后下一次启动不报告异常终止', async () => {
    const path = await markerPath()
    await expect(beginRunMarker(path, 100, new Date('2026-08-14T00:00:00.000Z'))).resolves.toBeUndefined()
    await clearRunMarker(path)
    await expect(beginRunMarker(path, 101, new Date('2026-08-14T00:01:00.000Z'))).resolves.toBeUndefined()
  })

  it('保留上一次异常终止的安全摘要并替换标记', async () => {
    const path = await markerPath()
    await beginRunMarker(path, 200, new Date('2026-08-14T00:00:00.000Z'))
    await expect(beginRunMarker(path, 201, new Date('2026-08-14T00:01:00.000Z'))).resolves.toEqual({
      startedAt: '2026-08-14T00:00:00.000Z',
      processId: 200,
      valid: true,
    })
    const current = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    expect(current).toEqual({ schemaVersion: 1, startedAt: '2026-08-14T00:01:00.000Z', processId: 201 })
  })

  it('无效内容只报告状态并拒绝删除目录目标', async () => {
    const path = await markerPath()
    await writeFile(path, '用户秘密不得回显')
    await expect(beginRunMarker(path, 300)).resolves.toEqual({ valid: false })

    await clearRunMarker(path)
    await mkdir(path)
    await expect(beginRunMarker(path, 301)).rejects.toThrow('普通文件')
    await expect(clearRunMarker(path)).rejects.toThrow('拒绝删除')
  })

  it('标记已不存在时清理保持幂等', async () => {
    const path = await markerPath()
    await expect(clearRunMarker(path)).resolves.toBeUndefined()
  })
})

async function markerPath(): Promise<string> {
  await mkdir(owner, { recursive: true })
  const root = await mkdtemp(resolve(owner, 'case-'))
  roots.push(root)
  const userData = resolve(root, 'user-data')
  await mkdir(userData)
  return resolve(userData, 'run-state.json')
}
