import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReleasePointer } from '../scripts/lib/release-channel.js'
import { readReleaseChannelState, writeReleaseChannelState } from '../scripts/lib/release-channel.js'

const stable = pointer('a')
const previous = pointer('b')

describe('发行通道原子状态', () => {
  it('在单个状态文件中共同保存 stable 与 previous', async () => {
    const owner = await mkdtemp(resolve(tmpdir(), 'dsh-release-channel-'))
    try {
      const path = resolve(owner, 'channel-state.json')
      await writeReleaseChannelState(path, { schemaVersion: 1, stable, previous }, owner)
      await expect(readReleaseChannelState(path)).resolves.toEqual({ schemaVersion: 1, stable, previous })
      await writeReleaseChannelState(path, { schemaVersion: 1, stable: previous, previous: stable }, owner)
      await expect(readReleaseChannelState(path)).resolves.toEqual({ schemaVersion: 1, stable: previous, previous: stable })
    } finally {
      await rm(owner, { recursive: true, force: true })
    }
  })

  it('拒绝 stable 与 previous 指向同一构建', async () => {
    const owner = await mkdtemp(resolve(tmpdir(), 'dsh-release-channel-'))
    try {
      await expect(writeReleaseChannelState(
        resolve(owner, 'channel-state.json'),
        { schemaVersion: 1, stable, previous: stable },
        owner,
      )).rejects.toThrow('不得指向同一构建')
    } finally {
      await rm(owner, { recursive: true, force: true })
    }
  })
})

function pointer(seed: string): ReleasePointer {
  return {
    schemaVersion: 1,
    desktopVersion: '0.1.0',
    buildId: seed.repeat(64),
    manifestPath: `candidates/${seed}/release-manifest.json`,
    manifestSha256: seed.repeat(64),
  }
}
