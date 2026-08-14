# Agent Note: 上游兼容的 Windows 桌面进程架构

Status: proposed

## Problem

DeepSeek Harness 的产品界面和运行时通过 `dsh web` 交付，但浏览器入口不具备桌面安装、单实例、受控生命周期、进程清理、签名发行和回滚体验。直接修改或复制 Harness 核心会让每次官方更新变成长期合并工作；把完整运行时加载到 Electron 又会把 Harness 原生模块的 ABI 和打包问题转移给桌面主进程。

## Proposal

桌面项目作为独立仓库消费精确版本的官方 `@deepseek-ai/dsh`。Electron 只负责窗口、权限策略、桌面生命周期和错误体验；独立 Node.js 24 运行时通过 Windows Job Object 启动器执行 `dsh web --host 127.0.0.1 --port 0`，BrowserWindow 只加载经验证的环回来源。

构建从冻结锁文件部署 Harness 生产依赖闭包，并校验官方 Node.js 发行物的 SHA-256。Harness、Node.js、Electron、桌面版本和资源哈希进入运行时清单。官方 Harness 更新通过精确版本候选、完整兼容性测试和人工提升进入下一桌面版本，不使用浮动依赖范围。

零上游源码路线通过桌面自有 bootstrap 把受控关闭消息转换为 Harness 现有信号关闭路径，并把人工可读就绪行隔离在版本适配器中。后续可以向上游提议版本化的机器就绪和关闭协议，但首发不依赖该贡献。

## Process ownership

Electron 主进程持有一个 `HarnessProcessSupervisor`。监管器持有启动器，启动器持有 Job Object，Job Object 持有 Node.js 及其后代。关闭从最外层向内请求并等待；超时后只终止该 Job Object，不按名称或未验证路径清理进程。

渲染进程不接收进程、文件系统、shell 或通用 IPC 能力。启动和失败页面是本地静态资源；Harness 页面运行在启用 sandbox、context isolation 和 web security 的 BrowserWindow 中。

## Alternatives considered

**直接在 Electron 主进程导入 Harness。** 该方案减少一个进程，但要求按 Electron ABI 重建 Harness 原生依赖，并把上游依赖闭包与主进程安全域耦合，因此不采用。

**Tauri 外壳。** 它仍需携带和监管 Node.js Harness，同时增加 Rust/WebView2 应用工具链，不能减少首发核心风险，因此延后。

**重写原生 Windows UI。** 它复制上游 React 产品并使每次 Harness 功能更新都需要再次实现，因此拒绝。

**首发即改为 Electron IPC。** 该方案需要改造启动清单、模块 bundle、客户端 transport、stream 和文件交互，不属于外部打包项目可独立完成的最小改动，因此延后。

## Acceptance criteria

- 干净构建从精确官方 Harness 版本和冻结锁文件生成安装包，不编辑 `deepseek-harness/`。
- 全新 Windows x64 环境无需系统 Node.js 即可安装、启动、创建会话并交换流式响应。
- 正常关闭、启动失败、子进程崩溃和 Electron 崩溃均不遗留 Harness 或 Node.js 后代。
- BrowserWindow 安全配置、来源限制、权限拒绝和外部导航策略通过自动化检查。
- 版本提升失败不能替换最后一个已知良好安装包，关于与诊断信息同时展示桌面和 Harness 精确版本。

## Risks

当前 Harness 就绪文本和信号监听器不是正式监管协议，版本升级可能使适配器失效；精确版本契约测试和独立 root probe 负责在发布前阻断。环回服务当前没有桌面专用 nonce，同机进程威胁只能通过临时端口、严格来源和短生命周期降低。Job Object 启动器、签名信誉、杀毒误报和 `$DSH_HOME` 数据演进仍需打包与干净环境证据才能关闭。

## 当前实施证据

桌面仓库已经按本提案实现独立运行时、Job Object launcher、安全窗口、全量文件索引、不可变候选、签名复验、精确上游候选和稳定/上一版回滚指针。当前清洁构建的标识覆盖 34,850 个运行时文件以及桌面 bundle，下载 ZIP 不进入应用；真实打包候选已完成单实例、包内 Node.js、仅回环监听、插件加载、会话创建、WebSocket 流式用户消息、renderer 刷新、隔离 `$DSH_HOME` 重启持久化和故障页验证，未签名内部安装器也已通过 `RELEASES`、完整包、构建标识和全量运行时的交叉审计。Microsoft Defender 扫描记录绑定当前候选 buildId 和 Setup.exe SHA-256，并由独立门禁拒绝篡改或伪造生产状态。

精确 npm `0.1.0-rc.6` 的浏览器事件下行使用 WebSocket，而当前上游参考检出已经使用 SSE。这一差异证明版本适配门禁不能只检查源码测试；打包端到端门禁同时支持两种已观察协议，并记录候选实际使用的传输，但桌面外壳不改写 Harness 协议。

本 Note 仍保持拟议状态。当前环境没有代码签名私钥或 Windows Sandbox，也没有 Windows 10/11 干净虚拟机、真实模型测试凭据、两版签名产物、SmartScreen 或组织指定补充扫描证据，因此当前实现不能提升为生产发行，也不能把缺失证据解释为接受本决策。
