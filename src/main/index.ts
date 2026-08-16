import { stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron'
import { readProductConfig } from '../shared/product-config.js'
import { resolveHarnessHome } from '../shared/harness-home.js'
import type { ReadyInfo, SafeError } from '../supervisor/contracts.js'
import { HarnessSupervisorError, DefaultHarnessProcessSupervisor } from '../supervisor/harness-process-supervisor.js'
import { NodeProcessLauncher } from '../supervisor/node-process-launcher.js'
import { loadVerifiedRuntimeLayout } from '../supervisor/runtime-layout.js'
import { SafeLog } from './safe-log.js'
import { beginRunMarker, clearRunMarker } from './run-marker.js'
import { handleSquirrelStartup } from './squirrel.js'
import { formatVersionDetails } from './version-details.js'
import { isAllowedNavigation, parseFailureAction, type FailureAction } from './window-policy.js'

if (handleSquirrelStartup()) {
  app.quit()
} else {
  app.enableSandbox()
  void runDesktop()
}

async function runDesktop(): Promise<void> {
  if (process.platform !== 'win32') {
    await app.whenReady()
    await dialog.showMessageBox({ type: 'error', title: 'DSH Desktop', message: '当前发行只支持 Windows x64。' })
    app.quit()
    return
  }

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  let window: BrowserWindow | undefined
  let allowedOrigin: ReadyInfo['origin'] | undefined
  let allowQuit = false
  let shutdownOperation: Promise<void> | undefined
  let supervisor: DefaultHarnessProcessSupervisor | undefined
  let readyIdentity: ReadyInfo | undefined
  let ownsRunMarker = false
  let handleFailureAction: (action: FailureAction) => void = () => undefined
  const rendererRoot = resolve(app.getAppPath(), 'dist', 'renderer')
  const startupPage = resolve(rendererRoot, 'startup.html')
  const failurePage = resolve(rendererRoot, 'failure.html')
  const localPages = [startupPage, failurePage]

  const focusWindow = (): void => {
    if (window === undefined || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }
  app.on('second-instance', focusWindow)

  await app.whenReady()
  const userHome = app.getPath('home')
  const log = new SafeLog(join(app.getPath('logs'), 'dsh-desktop.log'), [join(userHome, '.dsh')])
  const runMarker = join(app.getPath('userData'), 'run-state.json')
  try {
    const previous = await beginRunMarker(runMarker, process.pid)
    ownsRunMarker = true
    if (previous !== undefined) log.write('previous-abnormal-termination', { ...previous })
  } catch (error) {
    log.write('run-marker-initialization-failed', { message: safeMessage(error) })
  }

  denyRendererCapabilities()
  window = createMainWindow(() => allowedOrigin, localPages, failurePage, log, action => handleFailureAction(action))
  window.webContents.on('render-process-gone', (_event, details) => {
    if (allowQuit) return
    log.write('renderer-process-gone', { reason: details.reason, exitCode: details.exitCode })
    void (async () => {
      await supervisor?.stop('failure').catch(error => log.write('renderer-cleanup-failed', { message: safeMessage(error) }))
      await showFailure(window, failurePage, {
        code: 'renderer-process-gone',
        message: '产品窗口意外退出。可以重新启动桌面应用或查看日志。',
      })
    })()
  })
  installMenu(
    () => readyIdentity,
    () => void shell.openPath(app.getPath('logs')),
    () => window,
  )
  await window.loadFile(startupPage)
  window.show()

  const quiesceAndQuit = (): Promise<void> => {
    if (shutdownOperation !== undefined) return shutdownOperation
    shutdownOperation = (async () => {
      log.write('desktop-shutdown-requested')
      await supervisor?.stop('app-quit')
      if (ownsRunMarker) {
        await clearRunMarker(runMarker).catch(error => {
          log.write('run-marker-cleanup-failed', { message: safeMessage(error) })
        })
        ownsRunMarker = false
      }
      await log.flush()
      allowQuit = true
      app.quit()
    })().catch(async error => {
      log.write('desktop-shutdown-failed', { message: safeMessage(error) })
      await log.flush()
      allowQuit = true
      app.exit(1)
    })
    return shutdownOperation
  }
  handleFailureAction = action => {
    if (action === 'retry') app.relaunch()
    void quiesceAndQuit()
  }
  app.on('before-quit', event => {
    if (allowQuit) return
    event.preventDefault()
    void quiesceAndQuit()
  })
  app.on('window-all-closed', () => void quiesceAndQuit())

  try {
    const config = await readProductConfig(resolve(app.getAppPath(), 'desktop.config.json'))
    if (process.versions.electron !== config.electron.version) {
      throw new Error('运行中的 Electron 与固定产品版本不一致。')
    }
    const runtimeBase = app.isPackaged
      ? resolve(process.resourcesPath, '.runtime')
      : resolve(process.env.DSH_DESKTOP_RUNTIME ?? resolve(app.getAppPath(), '.runtime'))
    const layout = await loadVerifiedRuntimeLayout(runtimeBase, config)
    const workingDirectory = await selectWorkingDirectory(userHome)
    const dshHome = resolveHarnessHome(process.env, userHome, workingDirectory)
    log.addSensitiveRoot(dshHome)
    supervisor = new DefaultHarnessProcessSupervisor({
      launcher: new NodeProcessLauncher(),
      launchSpec: {
        launcherPath: layout.launcherPath,
        nodePath: layout.nodePath,
        bootstrapPath: layout.bootstrapPath,
        harnessBinPath: layout.harnessBinPath,
        workingDirectory,
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
      sensitiveRoots: [dshHome],
      onListenerError: error => log.write('state-listener-failed', { message: safeMessage(error) }),
    })
    supervisor.onStateChange((state, error) => {
      log.write('harness-state-changed', error === undefined ? { state } : { state, error })
      if (state === 'failed' && error !== undefined) void showFailure(window, failurePage, error)
    })

    const ready = await supervisor.start()
    readyIdentity = ready
    allowedOrigin = ready.origin
    window.setTitle(`DSH Desktop · Harness ${ready.harnessVersion}`)
    log.write('harness-ready', {
      origin: ready.origin,
      desktopVersion: ready.desktopVersion,
      harnessVersion: ready.harnessVersion,
      nodeVersion: ready.nodeVersion,
      buildId: ready.buildId,
    })
    await window.loadURL(ready.origin)
  } catch (error) {
    const failure = classifyStartupError(error)
    log.write('desktop-startup-failed', {
      code: failure.code,
      message: failure.message,
      diagnostics: error instanceof HarnessSupervisorError ? error.diagnostics : undefined,
    })
    await showFailure(window, failurePage, failure)
  }
}

function denyRendererCapabilities(): void {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setDevicePermissionHandler(() => false)
}

function createMainWindow(
  harnessOrigin: () => ReadyInfo['origin'] | undefined,
  localPages: readonly string[],
  failurePage: string,
  log: SafeLog,
  onFailureAction: (action: FailureAction) => void,
): BrowserWindow {
  const window = new BrowserWindow({
    title: 'DSH Desktop',
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: '#f3f1ec',
    icon: resolve(app.getAppPath(), 'dist', 'renderer', 'icons', 'png', 'app-icon-256.png'),
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  const guardNavigation = (event: Electron.Event, targetUrl: string): void => {
    const action = parseFailureAction(window.webContents.getURL(), targetUrl, failurePage)
    if (action !== undefined) {
      event.preventDefault()
      onFailureAction(action)
      return
    }
    if (isAllowedNavigation(targetUrl, harnessOrigin(), localPages)) return
    event.preventDefault()
    log.write('navigation-denied', { protocol: safeProtocol(targetUrl) })
  }
  window.webContents.on('will-navigate', guardNavigation)
  window.webContents.on('will-redirect', guardNavigation)
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.webContents.setWindowOpenHandler(details => {
    log.write('window-open-denied', { protocol: safeProtocol(details.url) })
    return { action: 'deny' }
  })
  return window
}

function installMenu(
  identity: () => ReadyInfo | undefined,
  openLogs: () => void,
  currentWindow: () => BrowserWindow | undefined,
): void {
  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '打开日志目录', click: openLogs },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '版本信息',
          click: () => {
            const current = identity()
            const detail = current === undefined
              ? 'Harness 尚未就绪。'
              : formatVersionDetails(current)
            const options = { type: 'info' as const, title: 'DSH Desktop 版本信息', message: 'DSH Desktop', detail }
            const parent = currentWindow()
            if (parent === undefined) void dialog.showMessageBox(options)
            else void dialog.showMessageBox(parent, options)
          },
        },
      ],
    },
  ])
  Menu.setApplicationMenu(menu)
}

async function selectWorkingDirectory(fallback: string): Promise<string> {
  const requested = process.env.DSH_DESKTOP_WORKSPACE
  const candidate = requested === undefined || requested.length === 0 ? fallback : requested
  if (!isAbsolute(candidate)) throw new Error('DSH_DESKTOP_WORKSPACE 必须是 Windows 绝对路径。')
  const metadata = await stat(candidate)
  if (!metadata.isDirectory()) throw new Error('DSH_DESKTOP_WORKSPACE 必须指向目录。')
  return resolve(candidate)
}

async function showFailure(window: BrowserWindow | undefined, page: string, error: SafeError): Promise<void> {
  if (window === undefined || window.isDestroyed()) return
  await window.loadFile(page, { query: { code: error.code, message: error.message } }).catch(() => undefined)
  window.show()
}

function classifyStartupError(error: unknown): SafeError {
  if (error instanceof HarnessSupervisorError) return { code: error.code, message: error.message }
  return { code: 'desktop-initialization-failed', message: '桌面运行时校验或初始化失败。请查看日志后重试。' }
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function safeProtocol(targetUrl: string): string {
  try {
    return new URL(targetUrl).protocol
  } catch {
    return 'invalid:'
  }
}
