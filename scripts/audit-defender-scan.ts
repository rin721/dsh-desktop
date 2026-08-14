import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { candidatePaths } from './lib/artifacts.js'
import { validateDefenderScanEvidence } from './lib/defender-scan-evidence.js'

const candidate = await candidatePaths()
const evidencePath = resolve(candidate.candidateRoot, 'defender-scan.json')
const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as unknown
const expectedArtifact = `make/squirrel.windows/x64/DSH Desktop-${candidate.desktopVersion} Setup.exe`
const installerPath = resolve(candidate.makeRoot, `DSH Desktop-${candidate.desktopVersion} Setup.exe`)

const actualHash = createHash('sha256').update(await readFile(installerPath)).digest('hex')
validateDefenderScanEvidence(evidence, {
  buildId: candidate.buildId,
  artifact: expectedArtifact,
  sha256: actualHash,
})
console.log(`Defender 扫描证据审计通过：${candidate.buildId}，SHA-256=${actualHash}`)
