import { access } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { MakerSquirrelConfig } from '@electron-forge/maker-squirrel'
import forgeConfig from '../forge.config.js'
import { windowsIconPath } from '../scripts/lib/icon-assets.js'

describe('桌面图标集成', () => {
  it('为 Electron Packager 配置受清单管理的 ICO', async () => {
    await expect(access(windowsIconPath)).resolves.toBeUndefined()
    expect(forgeConfig.packagerConfig?.icon).toBe(windowsIconPath)
  })

  it('为 Squirrel Setup 配置同一 ICO', () => {
    const squirrel = forgeConfig.makers?.find(maker => 'name' in maker
      && maker.name === '@electron-forge/maker-squirrel')
    const config = squirrel !== undefined && 'config' in squirrel
      ? squirrel.config as MakerSquirrelConfig | undefined
      : undefined
    expect(config?.setupIcon).toBe(windowsIconPath)
  })
})
