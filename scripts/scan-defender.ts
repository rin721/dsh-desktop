import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { candidatePaths } from './lib/artifacts.js'
import { validateDefenderScanEvidence } from './lib/defender-scan-evidence.js'

if (process.platform !== 'win32') throw new Error('Defender 扫描门禁只支持 Windows。')
const candidate = await candidatePaths()
const artifact = `make/squirrel.windows/x64/DSH Desktop-${candidate.desktopVersion} Setup.exe`
const installerPath = resolve(candidate.makeRoot, `DSH Desktop-${candidate.desktopVersion} Setup.exe`)
const sha256 = createHash('sha256').update(await readFile(installerPath)).digest('hex')
const observation = await runDefenderScan(installerPath)
const evidence = {
  schemaVersion: 1,
  buildId: candidate.buildId,
  artifact,
  sha256,
  scanner: 'Microsoft Defender Antivirus',
  engineVersion: observation.engineVersion,
  productVersion: observation.productVersion,
  signatureVersion: observation.signatureVersion,
  signatureLastUpdated: observation.signatureLastUpdated,
  scanStartedAt: observation.scanStartedAt,
  scanCompletedAt: observation.scanCompletedAt,
  matchingThreatDetectionCount: observation.matchingThreatDetectionCount,
  productionRelease: false,
  scanObservation: 'Start-MpScan 同步命令开始与成功返回时间',
  limitations: [
    '本记录只证明该文件在所列 Defender 引擎和签名版本下未产生匹配检测。',
    '本记录不替代 Authenticode、SmartScreen、干净虚拟机或组织指定的发布扫描。',
  ],
}
validateDefenderScanEvidence(evidence, { buildId: candidate.buildId, artifact, sha256 })
await writeFile(resolve(candidate.candidateRoot, 'defender-scan.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(`Defender 扫描通过并写入候选证据：${candidate.buildId}`)

interface DefenderObservation {
  engineVersion: string
  productVersion: string
  signatureVersion: string
  signatureLastUpdated: string
  scanStartedAt: string
  scanCompletedAt: string
  matchingThreatDetectionCount: number
}

async function runDefenderScan(path: string): Promise<DefenderObservation> {
  const script = [
    "$ErrorActionPreference='Stop'",
    "$path=[IO.Path]::GetFullPath($env:DSH_DEFENDER_SCAN_PATH)",
    "$status=Get-MpComputerStatus -ErrorAction Stop",
    "if(-not $status.AntivirusEnabled){throw 'Microsoft Defender Antivirus 未启用。'}",
    '$started=Get-Date',
    'Start-MpScan -ScanType CustomScan -ScanPath $path -ErrorAction Stop',
    '$completed=Get-Date',
    '$matches=@(Get-MpThreatDetection -ErrorAction SilentlyContinue|Where-Object{$hit=$false;foreach($resource in @($_.Resources)){if($resource -is [string] -and $resource.IndexOf($path,[StringComparison]::OrdinalIgnoreCase) -ge 0){$hit=$true}};$hit})',
    '[pscustomobject]@{engineVersion=$status.AMEngineVersion;productVersion=$status.AMProductVersion;signatureVersion=$status.AntivirusSignatureVersion;signatureLastUpdated=$status.AntivirusSignatureLastUpdated.ToString("o");scanStartedAt=$started.ToString("o");scanCompletedAt=$completed.ToString("o");matchingThreatDetectionCount=$matches.Count}|ConvertTo-Json -Compress',
  ].join(';')
  const output = await capturePowerShell(script, path)
  const value = JSON.parse(output) as Partial<DefenderObservation>
  if (typeof value.engineVersion !== 'string'
    || typeof value.productVersion !== 'string'
    || typeof value.signatureVersion !== 'string'
    || typeof value.signatureLastUpdated !== 'string'
    || typeof value.scanStartedAt !== 'string'
    || typeof value.scanCompletedAt !== 'string'
    || typeof value.matchingThreatDetectionCount !== 'number') {
    throw new Error('Defender 扫描返回无效字段。')
  }
  return value as DefenderObservation
}

async function capturePowerShell(script: string, path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DSH_DEFENDER_SCAN_PATH: path },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolvePromise(stdout.trim())
      else reject(new Error(`Defender 扫描失败：code=${String(code)} ${stderr.trim()}`))
    })
  })
}
