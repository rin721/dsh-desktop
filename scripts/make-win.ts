import { projectRoot, runtimeRoot } from './lib/project.js'
import { runPnpm } from './lib/process.js'
import { appStageRoot } from './lib/stage.js'
import { candidatePaths } from './lib/artifacts.js'
import { verifyDesktopBundleMatchesRuntime } from './lib/verify-desktop-bundle.js'

await runPnpm(['run', 'build'], projectRoot)
await verifyDesktopBundleMatchesRuntime(projectRoot, runtimeRoot)
const candidate = await candidatePaths()
process.env.DSH_DESKTOP_FORGE_OUT_DIR = candidate.candidateRoot
await runPnpm([
  'exec',
  'electron-forge',
  'make',
  appStageRoot,
  '--skip-package',
  '--platform',
  'win32',
  '--arch',
  'x64',
], projectRoot)
