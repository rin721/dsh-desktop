import { resolve } from 'node:path'
import { projectRoot } from './project.js'

/** 图标资源目录。 */
export const iconAssetsRoot = resolve(projectRoot, 'assets', 'icons')

/** Electron Packager 与 Squirrel Setup 共用的 Windows ICO。 */
export const windowsIconPath = resolve(iconAssetsRoot, 'app-icon.ico')

/** 进入 renderer ASAR 的最小 PNG 尺寸集合。 */
export const rendererIconSizes = [192, 256] as const
