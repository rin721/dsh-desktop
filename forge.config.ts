import type { ForgeConfig } from '@electron-forge/shared-types'
import type { MakerSquirrelConfig } from '@electron-forge/maker-squirrel'
import type { SignToolOptions } from '@electron/windows-sign'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { windowsIconPath } from './scripts/lib/icon-assets.js'
import { validateSigningEnvironment } from './scripts/lib/signing.js'

const releaseSigning = process.env.DSH_DESKTOP_RELEASE === '1'
if (releaseSigning) validateSigningEnvironment()
const makerConfig: MakerSquirrelConfig = {
  name: 'DshDesktop',
  authors: 'DSH Desktop contributors',
  description: 'DeepSeek Harness 的上游兼容 Windows 桌面外壳',
  noDelta: true,
  setupIcon: windowsIconPath,
}
const defaultOutDir = resolve(import.meta.dirname, 'out')
const requestedOutDir = process.env.DSH_DESKTOP_FORGE_OUT_DIR
const outDir = requestedOutDir === undefined ? defaultOutDir : validateCandidateOutDir(requestedOutDir)
if (releaseSigning) {
  makerConfig.windowsSign = {
    description: 'DSH Desktop',
    hashes: ['sha256'] as NonNullable<SignToolOptions['hashes']>,
  }
}

const config: ForgeConfig = {
  outDir,
  packagerConfig: {
    executableName: 'dsh-desktop',
    icon: windowsIconPath,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: makerConfig,
    },
  ],
}

export default config

function validateCandidateOutDir(path: string): string {
  if (!isAbsolute(path)) throw new Error('DSH_DESKTOP_FORGE_OUT_DIR 必须是绝对路径。')
  const root = resolve(import.meta.dirname, 'out', 'candidates')
  const relation = relative(root, resolve(path))
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error('DSH_DESKTOP_FORGE_OUT_DIR 必须位于 out/candidates 的具体候选目录。')
  }
  return resolve(path)
}
