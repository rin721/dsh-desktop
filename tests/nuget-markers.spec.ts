import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { removeVerifiedNugetEmptyDirectoryMarkers } from '../scripts/lib/nuget-markers.js'
import { removeOwnedPath } from '../scripts/lib/project.js'

const owner = resolve(tmpdir(), 'dsh-desktop-nuget-marker-tests')
const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await removeOwnedPath(root, owner)
})

describe('removeVerifiedNugetEmptyDirectoryMarkers', () => {
  it('只移除与原始空目录对应的零字节标记', async () => {
    const { candidate, extracted } = await fixture()
    await mkdir(resolve(candidate, 'empty'), { recursive: true })
    await mkdir(resolve(extracted, 'empty'), { recursive: true })
    await writeFile(resolve(extracted, 'empty', '_._'), '')

    await expect(removeVerifiedNugetEmptyDirectoryMarkers(extracted, candidate)).resolves.toBe(1)
    await expect(readFile(resolve(extracted, 'empty', '_._'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('保留候选本来就有并应由索引验证的同名文件', async () => {
    const { candidate, extracted } = await fixture()
    await writeFile(resolve(candidate, '_._'), '真实文件')
    await writeFile(resolve(extracted, '_._'), '真实文件')

    await expect(removeVerifiedNugetEmptyDirectoryMarkers(extracted, candidate)).resolves.toBe(0)
    await expect(readFile(resolve(extracted, '_._'), 'utf8')).resolves.toBe('真实文件')
  })

  it('拒绝非零或无法对应原始空目录的伪标记', async () => {
    const first = await fixture()
    await writeFile(resolve(first.extracted, '_._'), '伪造')
    await expect(removeVerifiedNugetEmptyDirectoryMarkers(first.extracted, first.candidate))
      .rejects.toThrow('不是零字节文件')

    const second = await fixture()
    await writeFile(resolve(second.candidate, 'keep.txt'), '保留')
    await writeFile(resolve(second.extracted, '_._'), '')
    await expect(removeVerifiedNugetEmptyDirectoryMarkers(second.extracted, second.candidate))
      .rejects.toThrow('原始目录并非空目录')
  })
})

async function fixture(): Promise<{ candidate: string; extracted: string }> {
  await mkdir(owner, { recursive: true })
  const root = await mkdtemp(resolve(owner, 'case-'))
  roots.push(root)
  const candidate = resolve(root, 'candidate')
  const extracted = resolve(root, 'extracted')
  await mkdir(candidate)
  await mkdir(extracted)
  return { candidate, extracted }
}
