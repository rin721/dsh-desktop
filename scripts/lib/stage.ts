import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { projectRoot } from './project.js'

export const appStageOwner = resolve(tmpdir(), 'dsh-desktop-build')
const projectIdentity = createHash('sha256').update(projectRoot).digest('hex').slice(0, 16)
export const appStageRoot = resolve(appStageOwner, projectIdentity, 'app')

