import { execFile } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { SignToolOptions } from '@electron/windows-sign'
import { projectRoot } from './project.js'

const execFileAsync = promisify(execFile)

/** 校验传统 PFX 发行签名输入，但不输出证书路径或密码。 */
export function validateSigningEnvironment(): void {
  const certificateFile = process.env.WINDOWS_CERTIFICATE_FILE
  const certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD
  if (certificateFile === undefined || certificateFile.length === 0 || !isAbsolute(certificateFile)) {
    throw new Error('签名发行要求 WINDOWS_CERTIFICATE_FILE 指向绝对 PFX 文件。')
  }
  if (certificatePassword === undefined || certificatePassword.length === 0) {
    throw new Error('签名发行要求非空 WINDOWS_CERTIFICATE_PASSWORD。')
  }
  const stats = lstatSync(certificateFile)
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('签名证书必须是普通文件，不能是目录或符号链接。')
}

export function releaseSignOptions(): SignToolOptions {
  validateSigningEnvironment()
  return {
    description: 'DSH Desktop',
    hashes: ['sha256'] as NonNullable<SignToolOptions['hashes']>,
  }
}

/** 使用 Windows SDK SignTool 验证文件具有受信任的 Authenticode 签名。 */
export async function verifyAuthenticode(paths: readonly string[]): Promise<void> {
  const signTool = resolve(projectRoot, 'node_modules', '@electron', 'windows-sign', 'vendor', 'signtool.exe')
  for (const path of paths) {
    await execFileAsync(signTool, ['verify', '/pa', '/all', path], {
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    })
  }
}
