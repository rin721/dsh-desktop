import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pathExists, removeEphemeralTree, removeOwnedPath } from '../scripts/lib/project.js'

describe('受管目录清理', () => {
  it('构建清理拒绝内部链接，临时清理只解除链接而不遍历目标', async () => {
    const owner = await mkdtemp(resolve(tmpdir(), 'dsh-cleanup-'))
    const real = resolve(owner, 'real')
    const cleanup = resolve(owner, 'cleanup')
    const link = resolve(cleanup, 'linked')
    try {
      await mkdir(real)
      await mkdir(cleanup)
      await writeFile(resolve(real, 'sentinel.txt'), '保留', 'utf8')
      await symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(removeOwnedPath(cleanup, owner)).rejects.toThrow('包含符号链接或目录联接')
      await removeEphemeralTree(cleanup, owner)
      await expect(readFile(resolve(real, 'sentinel.txt'), 'utf8')).resolves.toBe('保留')
      expect(await pathExists(link)).toBe(false)
    } finally {
      if (await pathExists(link)) await unlink(link)
      await rm(owner, { recursive: true, force: true })
    }
  })
})
