# DSH Desktop 开发流程

## 前置条件

开发机使用 Windows x64、Node.js `24.11.1` 或兼容的 Node.js 24 版本、Corepack、pnpm `11.7.0`、Rust 和可用的 C++ Windows SDK 链接环境。普通开发不要求修改或构建 `deepseek-harness/`。

## 安装与静态验证

```powershell
corepack pnpm install
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run test
```

依赖必须从 `pnpm-lock.yaml` 解析。CI 和发布使用 `--frozen-lockfile`；普通版本升级先修改精确版本，再显式刷新锁文件并评审依赖差异。

## 运行时暂存

```powershell
corepack pnpm run stage:runtime
```

该命令依次构建桌面 TypeScript、核对锁文件中的 Harness 精确 tarball 与 SRI、使用 `pnpm deploy --prod` 生成独立生产闭包、拒绝链接、从官方来源校验 Node.js 和 Electron Windows x64 压缩包、编译原生 launcher，最后生成第三方组件清单、全量运行时文件索引和身份清单。暂存目录 `.runtime/` 可删除后重建，不是源码；Node.js 与 Electron 的下载 ZIP 只保存在 `.build-cache/`，固定 SHA-256 通过后解压或供打包器读取，缓存本身不进入应用。

运行时契约可单独验证：

```powershell
corepack pnpm run smoke:launcher
corepack pnpm run smoke:native
corepack pnpm run smoke:runtime
```

三项检查分别验证 Windows Unicode 命令行往返、固定 Node.js 下的 `node-pty` 与 `koffi` 原生模块，以及真实官方 Harness 的就绪探测和优雅关闭。

## 图标资源

应用使用 `assets/icons/app-icon-master.png` 作为透明母版，派生的多尺寸 PNG 和 `app-icon.ico` 分别供窗口、启动与错误页、应用 EXE 和 Squirrel Setup 使用。ASAR 只包含页面实际消费的 192 和 256 像素 PNG，不携带参考原图、生成中间件、母版、其他尺寸、联系表或 ICO。日常构建只消费已生成资源，不要求安装 Python；修改母版时才使用带 Pillow 的 Python 3 运行 `scripts/generate_icon_assets.py`，随后必须查看联系表并执行 `corepack pnpm run verify:icons`。尺寸、哈希、来源和生成规范见[图标资源说明](../assets/icons/README.md)。

## 本地启动与打包

```powershell
corepack pnpm start
corepack pnpm run package:win
corepack pnpm run audit:package
corepack pnpm run smoke:packaged
corepack pnpm run make:win
corepack pnpm run scan:defender
corepack pnpm run audit:defender
```

`start` 也通过真实暂存运行时和监管器启动，不以 Vite 或系统 Node.js 快捷路径替代产品入口。`package:win` 先创建位于系统临时目录的最小应用输入，再直接调用 Electron Packager，烧录安全 fuses，并用 `robocopy` 流式复制已验证运行时，避免 Forge 扫描完整开发依赖或把十万级文件清单保留在 V8 堆中。`audit:package` 检查 ASAR 边界、fuses 和运行时哈希。

每个应用目录位于 `out/candidates/<桌面版本>-<构建标识>/`，已存在候选拒绝覆盖。`smoke:packaged` 运行该目录中的真实 EXE，使用临时 Unicode 工作目录和隔离 `$DSH_HOME`，验证 Electron 页面、会话创建、WebSocket 或 SSE 流式事件、renderer 刷新、正常关闭和重启持久化。固定 npm `0.1.0-rc.6` 当前使用 WebSocket；门禁也兼容上游检出已经采用的 SSE，但不会把传输差异隐藏为同一版本事实。

`make:win` 生成未签名内部安装器并执行结构审计。`scan:defender` 调用已启用的 Microsoft Defender 扫描当前 Setup.exe，并写出绑定构建标识、安装器 SHA-256、引擎、安全情报和扫描时间的非生产证据；`audit:defender` 独立复核该记录。安装器、签名、上游候选、提升和回滚的完整规则归于[发布流程](release.md)；运行日志、异常终止和故障恢复归于[运维参考](operations.md)。

## 发布与 Windows CI

普通 Windows CI 已配置为使用冻结锁文件运行源码、依赖审计、真实运行时、应用包、窗口 E2E、内部安装器、安装和卸载门禁，但不签名或发布。受保护签名候选和人工提升流程见[发布流程](release.md)。

## 变更验证

源码变更运行受影响 Vitest、typecheck、lint 和空白检查。进程与关闭变更额外验证正常关闭、就绪前退出、超时、父进程消失和后代进程清理。`smoke:launcher` 已自动化验证真实 Windows launcher 的正常退出、优雅截止后强制终止、父进程消失、Job Object 后代清理和 Unicode 命令行；当前还实测了正常关窗、第二实例退出、强制终止 Electron 主进程后的 Job Object 清理，以及打包应用与已安装应用使用包内 Node.js 启动 Harness。发布仍需验证 Windows 10/11 干净机、真实模型流式回答、无残留卸载、上一签名版本升级/回滚以及 SmartScreen 或组织指定补充扫描。
