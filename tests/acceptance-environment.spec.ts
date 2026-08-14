import { describe, expect, it } from 'vitest'
import { sanitizedAcceptanceEnvironment } from '../scripts/lib/acceptance-environment.js'

describe('验收子进程环境', () => {
  it('不向 Harness 传递模型、云端、CI 或签名秘密', () => {
    const result = sanitizedAcceptanceEnvironment({
      Path: 'C:\\Windows',
      APPDATA: 'C:\\Profile',
      deepseek_api_key: 'secret-1',
      GH_TOKEN: 'secret-2',
      AWS_PROFILE: 'secret-3',
      Windows_Certificate_File: 'C:\\cert.pfx',
      WINDOWS_CERTIFICATE_PASSWORD: 'secret-4',
      GOOGLE_APPLICATION_CREDENTIALS: 'C:\\cloud.json',
    })

    expect(result).toEqual({ Path: 'C:\\Windows', APPDATA: 'C:\\Profile' })
  })
})
