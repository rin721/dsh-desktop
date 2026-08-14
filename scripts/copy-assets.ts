import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectRoot, removeOwnedPath } from './lib/project.js'

const source = resolve(projectRoot, 'assets')
const target = resolve(projectRoot, 'dist', 'renderer')

await mkdir(resolve(projectRoot, 'dist'), { recursive: true })
await removeOwnedPath(target, resolve(projectRoot, 'dist'))
await cp(source, target, { recursive: true, force: true })
