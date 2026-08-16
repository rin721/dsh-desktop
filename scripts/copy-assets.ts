import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { rendererIconSizes } from './lib/icon-assets.js'
import { projectRoot, removeOwnedPath } from './lib/project.js'

const source = resolve(projectRoot, 'assets')
const target = resolve(projectRoot, 'dist', 'renderer')
const rendererFiles = ['desktop.css', 'failure.html', 'failure.js', 'startup.html'] as const

await mkdir(resolve(projectRoot, 'dist'), { recursive: true })
await removeOwnedPath(target, resolve(projectRoot, 'dist'))
await mkdir(resolve(target, 'icons', 'png'), { recursive: true })
await Promise.all([
  ...rendererFiles.map(file => cp(resolve(source, file), resolve(target, file), {
    force: false,
    errorOnExist: true,
  })),
  ...rendererIconSizes.map(size => cp(
    resolve(source, 'icons', 'png', `app-icon-${size}.png`),
    resolve(target, 'icons', 'png', `app-icon-${size}.png`),
    { force: false, errorOnExist: true },
  )),
])
