import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { candidatePaths } from './lib/artifacts.js'
import { pathExists, projectRoot } from './lib/project.js'
import { runPnpm } from './lib/process.js'
import { pointerForManifest, readReleaseChannelState, verifyReleasePointer, writeReleaseChannelState } from './lib/release-channel.js'

const confirmed = argument('--confirm-build')
const candidate = await candidatePaths()
if (confirmed !== candidate.buildId) throw new Error('提升要求 --confirm-build 精确匹配当前候选 buildId。')
await runPnpm(['run', 'verify:release'], projectRoot)

const outRoot = resolve(projectRoot, 'out')
const channels = resolve(outRoot, 'channels')
const statePath = resolve(channels, 'channel-state.json')
await mkdir(channels, { recursive: true })
const next = await pointerForManifest(outRoot, resolve(candidate.makeRoot, 'release-manifest.json'))
await verifyReleasePointer(outRoot, next)
if (await pathExists(statePath)) {
  const current = await readReleaseChannelState(statePath)
  await verifyReleasePointer(outRoot, current.stable)
  if (current.previous !== undefined) await verifyReleasePointer(outRoot, current.previous)
  if (current.stable.buildId === next.buildId) throw new Error('当前候选已经是 stable。')
  await writeReleaseChannelState(statePath, { schemaVersion: 1, stable: next, previous: current.stable }, channels)
} else {
  await writeReleaseChannelState(statePath, { schemaVersion: 1, stable: next }, channels)
}
console.log(`stable 已提升到 buildId=${next.buildId}；旧候选产物未删除。`)

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}
