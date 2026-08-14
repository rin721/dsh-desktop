import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import type { HarnessLaunchSpec, ManagedProcess, ProcessLauncher, ProcessOutcome } from './contracts.js'

function controlledEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment = { ...source }
  delete environment.NODE_OPTIONS
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.ELECTRON_ENABLE_LOGGING
  return environment
}

/** 通过独立 Windows launcher 创建受 Job Object 约束的 Harness 进程。 */
export class NodeProcessLauncher implements ProcessLauncher {
  /** @inheritdoc */
  launch(spec: HarnessLaunchSpec): ManagedProcess {
    const child = spawn(spec.launcherPath, [
      '--parent-pid',
      String(spec.parentPid),
      '--cwd',
      spec.workingDirectory,
      '--',
      spec.nodePath,
      '--import',
      pathToFileURL(spec.bootstrapPath).href,
      spec.harnessBinPath,
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ], {
      cwd: spec.workingDirectory,
      env: controlledEnvironment(spec.environment),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    if (child.stdin === null || child.stdout === null || child.stderr === null) {
      child.kill()
      throw new Error('Windows launcher 未创建必需的标准流。')
    }

    const done = new Promise<ProcessOutcome>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }))
    })
    return {
      stdin: child.stdin,
      stdout: child.stdout,
      stderr: child.stderr,
      done,
      forceTerminate: () => {
        if (!child.kill()) throw new Error('Windows launcher 强制终止请求失败。')
      },
    }
  }
}
