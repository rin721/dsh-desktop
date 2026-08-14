import { projectRoot, runtimeRoot } from './lib/project.js'
import { runPnpm } from './lib/process.js'
import { appStageRoot } from './lib/stage.js'

process.env.DSH_DESKTOP_RUNTIME = runtimeRoot
await runPnpm(['exec', 'electron-forge', 'start', appStageRoot], projectRoot)
