# DSH Desktop 架构

## 当前有效状态

本仓库当前已实现独立桌面边界、精确来源配置、可再生 Harness runtime、Windows Job Object launcher、监管器、安全 Electron 窗口、不可变 Windows x64 候选、签名验证流水线和稳定/上一版回滚指针。当前未签名安装器已有绑定候选身份与哈希的 Microsoft Defender 零匹配扫描记录；签名证书、干净虚拟机、上一签名版本升级/回滚、真实模型回答以及 SmartScreen 或组织指定补充扫描证据仍未取得，本页不把这些外部门禁描述为已交付。

## 所有权

| 位置 | 所有权 |
| --- | --- |
| `deepseek-harness/` | 被忽略的上游参考检出，不进入桌面 Git 历史或安装包。 |
| `packages/harness-runtime/` | 仅声明官方 Harness 精确版本，供 `pnpm deploy --prod` 生成生产闭包。 |
| `src/` | 桌面主进程、监管器、启动适配器和本地启动/失败页面。 |
| `assets/icons/` | 角色图标透明母版、多尺寸 PNG、Windows ICO、视觉检查表和完整性清单。 |
| `native/launcher/` | Windows Job Object 启动器源码；其 release 可执行文件作为独立资源进入安装包。 |
| `.runtime/` | 可再生的 Node.js、Harness 生产闭包、启动器和版本清单，不提交。 |
| `.build-cache/` | 经过固定哈希验证的官方发行压缩包缓存，不提交且不进入候选。 |
| 系统临时目录中的应用暂存 | 只包含 `package.json`、产品配置和编译后桌面文件，隔离 Forge/Packager 与开发依赖树。 |
| `out/candidates/<版本>-<构建标识>/` | 不可覆盖的应用、安装器和验收报告；旧候选为回滚保留。 |

## 进程边界

当前运行路径为 `Electron main -> Windows launcher -> standalone node.exe -> official dsh web`。Harness 继续提供现有 HTTP、流式传输、启动清单和 React 界面；Electron 不直接导入 Harness，也不把它加载到 Electron 内置 Node.js。精确 npm `0.1.0-rc.6` 的事件下行是 WebSocket，而当前上游参考检出已改用 SSE；桌面外壳不重写任一协议，升级门禁通过真实候选识别这类漂移。launcher 为子进程树创建启用 `KILL_ON_JOB_CLOSE` 的 Job Object，并持有精确父进程句柄；正常关闭先通过 stdin bootstrap 转换为 Harness 现有 `SIGTERM` 事件，超时或父进程消失时再终止完整 Job。

BrowserWindow 只加载已经验证的 `http://127.0.0.1:<ephemeral-port>`，关闭 Node integration、启用 context isolation 和 renderer sandbox，并拒绝非预期权限、导航和窗口创建。桌面自有监管接口负责启动、就绪探测、状态通知、优雅关闭和有界强制清理。

应用 ASAR 不含 npm 运行依赖、开发源码或上游检出。独立 Node.js、Harness 生产闭包、bootstrap、launcher、第三方组件清单和运行时索引位于 `resources/.runtime`；Node.js 与 Electron 下载 ZIP 只在构建缓存中。当前清洁构建记录 34,850 个文件的大小和 SHA-256；包审计拒绝缺失、增加、链接或内容变化，并从 ASAR 重新计算桌面 bundle 身份。这样原生 Harness 依赖只面向固定 Node.js ABI，不参与 Electron rebuild。

## 版本来源

`desktop.config.json` 是运行时版本、官方来源哈希和超时参数的唯一人工维护来源。`packages/harness-runtime/package.json`、根 `package.json` 和 `pnpm-lock.yaml` 必须与它一致；暂存脚本在复制资源前验证 npm tarball、SRI、Electron 官方压缩包 SHA-256 和这些版本关系。构建标识同时覆盖运行时索引、合规清单、桌面编译产物和配置，避免不同外壳复用同一身份。

## 发行边界

生产发行按 `launcher 签名 -> 重写运行时索引和身份 -> 应用打包 -> 应用 EXE 签名 -> 包审计 -> Squirrel 签名安装器 -> 解包复验 -> Defender 扫描` 顺序执行。发行清单记录来源、版本、构建标识和所有分发文件哈希，Defender 证据绑定最终 Setup.exe 哈希；任何签名、清单、包内文件或扫描结果不一致都会阻止提升。

稳定和上一版只是 `channel-state.json` 中指向不可变、已验签候选的两个清单指针；两者通过一次单文件原子替换共同提交，不搬移或覆盖候选文件。回滚只交换桌面二进制指针，不操作 `$DSH_HOME`，因为较新 Harness 可能已经写入旧二进制无法安全降级的数据。

签名、内部安装器、官方供应、源码备用边界和 CI 的操作规则见[发布流程](release.md)。
