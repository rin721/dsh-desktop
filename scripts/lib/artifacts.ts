import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { projectRoot, runtimeRoot } from './project.js'

export interface CandidatePaths {
  desktopVersion: string
  buildId: string
  candidateRoot: string
  appRoot: string
  makeRoot: string
}

/** 根据已生成的运行时构建标识选择不可覆盖的候选产物目录。 */
export async function candidatePaths(): Promise<CandidatePaths> {
  const packageManifest = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')) as { version?: unknown }
  const runtimeManifest = JSON.parse(await readFile(resolve(runtimeRoot, 'runtime-manifest.json'), 'utf8')) as { buildId?: unknown }
  if (typeof packageManifest.version !== 'string' || !/^[0-9A-Za-z.-]+$/u.test(packageManifest.version)) {
    throw new Error('桌面版本不能安全用于候选目录名称。')
  }
  if (typeof runtimeManifest.buildId !== 'string' || !/^[0-9a-f]{64}$/u.test(runtimeManifest.buildId)) {
    throw new Error('运行时构建标识不能安全用于候选目录名称。')
  }
  const candidateRoot = resolve(projectRoot, 'out', 'candidates', `${packageManifest.version}-${runtimeManifest.buildId}`)
  return {
    desktopVersion: packageManifest.version,
    buildId: runtimeManifest.buildId,
    candidateRoot,
    appRoot: resolve(candidateRoot, 'DSH Desktop-win32-x64'),
    makeRoot: resolve(candidateRoot, 'make', 'squirrel.windows', 'x64'),
  }
}
