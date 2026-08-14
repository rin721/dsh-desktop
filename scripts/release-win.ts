import process from 'node:process'
import { projectRoot } from './lib/project.js'
import { runPnpm } from './lib/process.js'
import { validateSigningEnvironment } from './lib/signing.js'

validateSigningEnvironment()
process.env.DSH_DESKTOP_RELEASE = '1'

for (const command of [
  ['run', 'stage:runtime'],
  ['run', 'smoke:launcher'],
  ['run', 'smoke:native'],
  ['run', 'smoke:runtime'],
  ['exec', 'tsx', 'scripts/sign-release-files.ts', 'runtime'],
  ['exec', 'tsx', 'scripts/write-runtime-index.ts'],
  ['exec', 'tsx', 'scripts/write-runtime-manifest.ts'],
  ['run', 'stage:app'],
  ['exec', 'tsx', 'scripts/package-win.ts'],
  ['exec', 'tsx', 'scripts/sign-release-files.ts', 'app'],
  ['run', 'audit:package'],
  ['run', 'smoke:packaged'],
  ['run', 'make:installer'],
  ['run', 'verify:release'],
  ['run', 'scan:defender'],
  ['run', 'smoke:installer'],
] as const) {
  await runPnpm([...command], projectRoot)
}
