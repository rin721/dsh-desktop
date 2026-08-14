import { projectRoot, runtimeRoot } from './lib/project.js'
import { verifyDesktopBundleMatchesRuntime } from './lib/verify-desktop-bundle.js'

await verifyDesktopBundleMatchesRuntime(projectRoot, runtimeRoot)
console.log('当前编译桌面 bundle 与运行时身份一致。')
