# DSH Desktop 验收状态

本页记录 2026-08-14 当前工作树相对于上游计划验收标准的事实。`通过` 表示已有当前候选的直接证据；`部分通过` 不可用于发布声明；`待外部证据` 表示实现已准备但本机无法替代证书、干净虚拟机或发布审批。

当前未安装候选：桌面版本 `0.1.0`，Harness `0.1.0-rc.6`，Node.js `24.11.1`，Electron `43.4.0`，构建标识 `bf3bc929fb4596b4cac8f580c14b8b81818c8045c183918b1ad5cdec1556b1ac`。

| 标准 | 状态 | 当前证据与缺口 |
| --- | --- | --- |
| AC-001 | 部分通过 | 固定官方 npm tarball、SRI、冻结锁文件和不修改上游源码的独立闭包均已校验。上游检出只有既有未跟踪计划目录，尚无干净提交状态证据。 |
| AC-002 | 待外部证据 | 自包含 Node.js 已通过包审计；尚未在全新 Windows 10/11 x64 虚拟机首次安装。 |
| AC-003 | 部分通过 | 单实例与正常窗口路径已有自动化和本机实测，当前候选已保存无用户数据的 renderer 截图；实际应用 EXE 和 Setup.exe 均已提取并目视确认同一角色图标。截图不含 Windows 窗口边框，仍缺完整桌面窗口录像或截图。 |
| AC-004 | 部分通过 | 当前打包 EXE 已验证就绪端口只监听 `127.0.0.1`，且端口所有者是候选目录中的内置 Node.js；安装器门禁也实现了相同检查，尚待干净安装执行。 |
| AC-005 | 部分通过 | 真实 Windows launcher 的正常退出、优雅截止后强制终止、父进程消失和 Job Object 后代清理已自动化通过；本机安装器 smoke 在任何安装动作前因既有安装残留安全拒绝，仍待干净机执行。 |
| AC-006 | 部分通过 | 当前打包 EXE 已完成页面加载、会话创建、WebSocket 用户消息事件、renderer 刷新、正常关闭和隔离 `$DSH_HOME` 重启持久化。没有测试凭据，因此真实模型流式回答未执行。 |
| AC-007 | 通过 | 50 项测试覆盖 sandbox、context isolation、导航/重定向、弹窗、权限拒绝、固定环回来源、有界就绪读取、错误页动作、诊断脱敏、运行标记、强制清理失败、验收环境秘密隔离、桌面闭包一致性、图标打包集成、Defender 证据防篡改、原子通道状态、不遍历链接的临时清理和 NuGet 空目录标记边界；打包配置再次审计。 |
| AC-008 | 待外部证据 | 525 个 npm 组件和 Node.js 许可已清点，运行时全量索引通过；当前未签名 Setup.exe 已由 Microsoft Defender 扫描且没有匹配检测，并保留引擎、签名版本、时间与哈希证据。仍没有代码签名证书、SmartScreen 或干净机发布扫描结果；6 个包声明了许可证元数据但部署根目录未携带独立许可文件，发布前需法律复核。 |
| AC-009 | 部分通过 | 版本信息菜单展示桌面、Harness、Node.js 和构建标识，独立安全快照测试已通过；仍缺当前候选原生窗口与版本对话框截图。 |
| AC-010 | 部分通过 | 定时上游检查、精确版本更新、冻结安装和候选门禁已实现，`rc.3 -> rc.6` 可逆演练通过；尚未产生实际更新拉取请求。 |
| AC-011 | 待外部证据 | 不可变候选、稳定/上一版指针、验签提升与回滚脚本已实现；没有两版签名产物，无法完成失败候选和真实回滚记录。 |
| AC-012 | 部分通过 | 无效工作目录故障注入已验证本地错误页文本、重新启动和退出按钮，并保存截图；renderer 崩溃、就绪超时、启动清理失败和关闭强制清理失败均有状态与诊断测试，尚未分别保存就绪超时和关闭失败截图。 |
| AC-013 | 通过 | `HarnessProcessSupervisor`、`ProcessLauncher` 和版本化 bootstrap 协议隔离于窗口与打包代码之外，并有契约测试。 |
| AC-014 | 部分通过 | 桌面仓库中文架构、开发和验收事实已更新；上游当前状态文档保持不变，Agent Note 仍为拟议状态，需维护者接受。 |

## 当前门禁结果

- `corepack pnpm run check`：17 个测试文件、50 项测试通过。
- `corepack pnpm run verify:icons`：透明母版、13 个 PNG 尺寸、9 个 ICO 帧、文件大小和 SHA-256 清单通过；实际应用 EXE 与 Setup.exe 提取图标 SHA-256 一致。ASAR 白名单只允许页面消费的 192 和 256 像素 PNG，不包含参考原图、生成中间件、母版、联系表、ICO 或其他尺寸。
- `corepack pnpm run smoke:launcher`：正常退出、优雅截止后强制终止、父进程消失、Job Object 后代清理以及 Unicode 路径与命令行往返通过。
- `corepack pnpm run smoke:native`：固定 Node.js 下的 `node-pty` 与 `koffi` 通过。
- `corepack pnpm run smoke:runtime`：官方 Harness 就绪探测与优雅关闭通过。
- `corepack pnpm run audit:package`：34,850 个运行时文件全量哈希通过，下载 ZIP 不在应用内。
- `corepack pnpm run smoke:packaged`：当前候选单实例、包内 Node.js、仅回环监听、完整插件加载、会话、WebSocket、刷新、持久化、故障页、正常关闭和两张无用户数据截图通过。
- `corepack pnpm run audit:installer`：`RELEASES`、257,012,923 字节完整包、246,266,368 字节 Setup.exe、构建标识和 34,850 个运行时文件通过；只归一化 1 个与原始空目录严格对应的 NuGet 零字节 `_._`。
- `corepack pnpm run verify:release`：按设计拒绝未签名 Setup.exe，SignTool 报告 `No signature found`。
- `corepack pnpm run smoke:installer`：在执行安装前拒绝覆盖既有 `C:\Users\xiaol\AppData\Local\DshDesktop`，未产生安装、删除或迁移动作；需转移到干净虚拟机。
- `corepack pnpm audit --prod --audit-level high`：没有已知漏洞。
- `corepack pnpm run scan:defender` 与 `corepack pnpm run audit:defender`：Microsoft Defender 引擎 `1.1.26070.7`、安全情报 `1.457.153.0` 对 SHA-256 `eeba7448849591d4463a57a992d7c179360a33ff9341eadbe6a816438b4b870e` 的 Setup.exe 完成扫描，证据通过身份与哈希复核，匹配威胁检测数为 0；不替代 Authenticode、SmartScreen 或干净机复核。

## 发布前必须补齐

1. 在受保护环境使用真实证书执行完整签名发行并复验所有签名。
2. 在干净 Windows 10 和 Windows 11 x64 虚拟机执行安装器门禁，并记录窗口、错误页和版本信息截图。
3. 使用专用测试凭据完成真实模型流式回答，不复用开发者个人秘密。
4. 从上一签名版本升级，演练失败候选不提升和二进制回滚，并确认不修改 `$DSH_HOME`。
5. 完成 SmartScreen 或组织指定补充扫描，并处理 Squirrel 卸载残留。
6. 复核第三方许可证文件缺口并接受 Agent Note 后，再申请发布批准。
