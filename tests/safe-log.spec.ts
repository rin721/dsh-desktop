import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SafeLog } from '../src/main/safe-log.js'
import { removeOwnedPath } from '../scripts/lib/project.js'

const owner = resolve(tmpdir(), 'dsh-desktop-safe-log-tests')
const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await removeOwnedPath(root, owner)
})

describe('SafeLog', () => {
  it('落盘前隐藏秘密和 Harness 用户目录', async () => {
    await mkdir(owner, { recursive: true })
    const root = await mkdtemp(resolve(owner, 'case-'))
    roots.push(root)
    const dshHome = resolve(root, '用户 数据', '.dsh')
    const path = resolve(root, 'logs', 'desktop.log')
    const log = new SafeLog(path)
    log.addSensitiveRoot(dshHome)
    log.write('failure', { message: `token=top-secret at ${resolve(dshHome, 'sessions', 'private.json')}` })
    await log.flush()

    const content = await readFile(path, 'utf8')
    expect(content).toContain('token=[REDACTED]')
    expect(content).toContain('$DSH_HOME')
    expect(content).not.toContain('top-secret')
    expect(content).not.toContain('用户 数据')
  })
})
