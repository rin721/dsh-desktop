import { resolve } from 'node:path'
import process from 'node:process'
import { readProductConfig } from '../src/shared/product-config.js'
import { DefaultHarnessProcessSupervisor } from '../src/supervisor/harness-process-supervisor.js'
import { NodeProcessLauncher } from '../src/supervisor/node-process-launcher.js'
import { loadVerifiedRuntimeLayout } from '../src/supervisor/runtime-layout.js'
import { projectRoot, runtimeRoot } from './lib/project.js'

const config = await readProductConfig(resolve(projectRoot, 'desktop.config.json'))
const layout = await loadVerifiedRuntimeLayout(runtimeRoot, config)
const supervisor = new DefaultHarnessProcessSupervisor({
  launcher: new NodeProcessLauncher(),
  launchSpec: {
    launcherPath: layout.launcherPath,
    nodePath: layout.nodePath,
    bootstrapPath: layout.bootstrapPath,
    harnessBinPath: layout.harnessBinPath,
    workingDirectory: projectRoot,
    parentPid: process.pid,
    environment: process.env,
  },
  identity: {
    desktopVersion: layout.identity.desktopVersion,
    harnessVersion: layout.identity.harnessVersion,
    nodeVersion: layout.identity.nodeVersion,
    buildId: layout.identity.buildId,
  },
  readinessTimeoutMs: config.startup.readinessTimeoutMs,
  shutdownTimeoutMs: config.startup.shutdownTimeoutMs,
  maxDiagnosticBytes: config.startup.maxDiagnosticBytes,
})

try {
  const ready = await supervisor.start()
  console.log(`运行时冒烟通过：Harness ${ready.harnessVersion}，Node.js ${ready.nodeVersion}，来源 ${ready.origin}`)
} finally {
  await supervisor.stop('app-quit')
}
