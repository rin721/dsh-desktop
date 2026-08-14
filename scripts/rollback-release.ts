import { resolve } from 'node:path'
import { pathExists, projectRoot } from './lib/project.js'
import { readReleaseChannelState, verifyReleasePointer, writeReleaseChannelState } from './lib/release-channel.js'

const confirmed = argument('--confirm-build')
const outRoot = resolve(projectRoot, 'out')
const channels = resolve(outRoot, 'channels')
const statePath = resolve(channels, 'channel-state.json')
if (!await pathExists(statePath)) throw new Error('回滚要求 channel-state.json 存在。')
const state = await readReleaseChannelState(statePath)
const stable = state.stable
const previous = state.previous
if (previous === undefined) throw new Error('回滚要求通道状态包含 previous。')
if (confirmed !== previous.buildId) throw new Error('回滚要求 --confirm-build 精确匹配 previous buildId。')
await verifyReleasePointer(outRoot, stable)
await verifyReleasePointer(outRoot, previous)
await writeReleaseChannelState(statePath, { schemaVersion: 1, stable: previous, previous: stable }, channels)
console.log(`stable 已回滚到 buildId=${previous.buildId}；未修改或降级 DSH_HOME。`)

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}
