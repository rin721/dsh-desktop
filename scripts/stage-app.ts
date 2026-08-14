import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathExists, projectRoot, removeOwnedPath } from './lib/project.js'
import { appStageOwner, appStageRoot } from './lib/stage.js'

const stageRoot = appStageRoot
const dist = resolve(projectRoot, 'dist')
if (!await pathExists(resolve(dist, 'main', 'index.js'))) {
  throw new Error('缺少编译后的桌面入口；请先运行 pnpm run build。')
}

const sourcePackage = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')) as Record<string, unknown>
const sourceDevDependencies = sourcePackage.devDependencies as Record<string, unknown> | undefined
const electronVersion = sourceDevDependencies?.electron
if (typeof electronVersion !== 'string') throw new Error('根 package.json 缺少精确 Electron 开发依赖。')
const stagedPackage = {
  name: sourcePackage.name,
  productName: sourcePackage.productName,
  version: sourcePackage.version,
  description: sourcePackage.description,
  author: sourcePackage.author,
  license: sourcePackage.license,
  private: true,
  type: 'module',
  main: 'dist/main/index.js',
  devDependencies: {
    electron: electronVersion,
  },
  config: {
    forge: resolve(projectRoot, 'forge.config.ts'),
  },
}

await removeOwnedPath(stageRoot, appStageOwner)
await mkdir(stageRoot, { recursive: true })
await cp(dist, resolve(stageRoot, 'dist'), {
  recursive: true,
  force: false,
  errorOnExist: true,
  filter: source => !source.endsWith('.map'),
})
await cp(resolve(projectRoot, 'desktop.config.json'), resolve(stageRoot, 'desktop.config.json'), {
  force: false,
  errorOnExist: true,
})
await writeFile(resolve(stageRoot, 'package.json'), `${JSON.stringify(stagedPackage, null, 2)}\n`, 'utf8')
console.log(`最小桌面应用输入已暂存：${stageRoot}`)
