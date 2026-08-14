export interface DefenderScanEvidence {
  schemaVersion: 1
  buildId: string
  artifact: string
  sha256: string
  scanner: 'Microsoft Defender Antivirus'
  engineVersion: string
  productVersion: string
  signatureVersion: string
  signatureLastUpdated: string
  scanStartedAt: string
  scanCompletedAt: string
  matchingThreatDetectionCount: 0
  productionRelease: false
}

/**
 * 校验 Defender 扫描记录与当前候选安装器身份一致，并拒绝把本地扫描声明成生产发布。
 * @param value - 从候选证据 JSON 解析出的未知值。
 * @param expected - 当前候选与安装器的可信预期值。
 * @returns 已校验的扫描记录。
 */
export function validateDefenderScanEvidence(
  value: unknown,
  expected: { buildId: string; artifact: string; sha256: string },
): DefenderScanEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('扫描证据必须是对象。')
  const evidence = value as Record<string, unknown>
  assertEqual(evidence.schemaVersion, 1, '扫描证据 schemaVersion')
  assertEqual(evidence.buildId, expected.buildId, '扫描证据 buildId')
  assertEqual(evidence.artifact, expected.artifact, '扫描证据 artifact')
  assertEqual(evidence.sha256, expected.sha256, '安装器 SHA-256')
  assertEqual(evidence.scanner, 'Microsoft Defender Antivirus', '扫描器')
  assertVersion(evidence.engineVersion, '引擎版本')
  assertVersion(evidence.productVersion, '产品版本')
  assertVersion(evidence.signatureVersion, '安全情报版本')
  assertTimestamp(evidence.signatureLastUpdated, '安全情报更新时间')
  assertTimestamp(evidence.scanStartedAt, '扫描开始时间')
  assertTimestamp(evidence.scanCompletedAt, '扫描完成时间')
  if (Date.parse(evidence.scanCompletedAt as string) < Date.parse(evidence.scanStartedAt as string)) {
    throw new Error('Defender 扫描完成时间早于开始时间。')
  }
  assertEqual(evidence.matchingThreatDetectionCount, 0, '匹配威胁检测数')
  assertEqual(evidence.productionRelease, false, '生产发布标记')
  return evidence as unknown as DefenderScanEvidence
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label} 不匹配。`)
}

function assertVersion(value: unknown, label: string): void {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+){2,3}$/u.test(value)) throw new Error(`${label} 无效。`)
}

function assertTimestamp(value: unknown, label: string): void {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label} 无效。`)
}
