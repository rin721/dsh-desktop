import type { ReadyInfo } from '../supervisor/contracts.js'

export interface VersionSnapshot {
  desktopVersion: string
  harnessVersion: string
  nodeVersion: string
  buildId: string
}

/** @param identity - 已通过运行时清单验证的产品身份。 @returns 不包含环境或用户数据的诊断快照。 */
export function createVersionSnapshot(identity: ReadyInfo): VersionSnapshot {
  return {
    desktopVersion: identity.desktopVersion,
    harnessVersion: identity.harnessVersion,
    nodeVersion: identity.nodeVersion,
    buildId: identity.buildId,
  }
}

/** @param identity - 已通过运行时清单验证的产品身份。 @returns 用于版本信息视图的中文文本。 */
export function formatVersionDetails(identity: ReadyInfo): string {
  const snapshot = createVersionSnapshot(identity)
  return [
    `桌面版本：${snapshot.desktopVersion}`,
    `Harness：${snapshot.harnessVersion}`,
    `Node.js：${snapshot.nodeVersion}`,
    `构建标识：${snapshot.buildId}`,
  ].join('\n')
}
