import { describe, expect, it } from 'vitest'
import { validateDefenderScanEvidence } from '../scripts/lib/defender-scan-evidence.js'

const expected = {
  buildId: 'a'.repeat(64),
  artifact: 'make/squirrel.windows/x64/DSH Desktop-0.1.0 Setup.exe',
  sha256: 'b'.repeat(64),
}

const validEvidence = {
  schemaVersion: 1,
  buildId: expected.buildId,
  artifact: expected.artifact,
  sha256: expected.sha256,
  scanner: 'Microsoft Defender Antivirus',
  engineVersion: '1.1.26070.7',
  productVersion: '4.18.26070.9',
  signatureVersion: '1.457.153.0',
  signatureLastUpdated: '2026-08-14T04:20:16.0000000+08:00',
  scanStartedAt: '2026-08-14T23:07:06.6371964+08:00',
  scanCompletedAt: '2026-08-14T23:07:06.6950794+08:00',
  matchingThreatDetectionCount: 0,
  productionRelease: false,
}

describe('Defender 扫描证据', () => {
  it('接受与当前候选一致的非生产扫描记录', () => {
    expect(validateDefenderScanEvidence(validEvidence, expected)).toEqual(validEvidence)
  })

  it('拒绝安装器哈希被替换的记录', () => {
    expect(() => validateDefenderScanEvidence({ ...validEvidence, sha256: 'c'.repeat(64) }, expected))
      .toThrow('安装器 SHA-256 不匹配')
  })

  it('拒绝把本地扫描记录声明成生产发布', () => {
    expect(() => validateDefenderScanEvidence({ ...validEvidence, productionRelease: true }, expected))
      .toThrow('生产发布标记 不匹配')
  })
})
