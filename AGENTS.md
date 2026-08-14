# DSH Desktop 开发规则

本仓库以 `deepseek-harness/AGENTS.md` 及其链接规则为工程规范来源。两者冲突时，以用户当前指令和 `deepseek-harness/AGENTS.md` 为准。

## 范围

- `deepseek-harness/` 是被忽略的上游检出，只用于源码验证、上游测试和计划追溯，不属于桌面仓库产物。
- 桌面应用必须通过精确版本的官方 `@deepseek-ai/dsh` 包消费 Harness，不复制、修补或提交上游核心源码。
- 桌面专用代码位于本仓库的 `src/`、`scripts/`、`native/`、`packages/` 和 `tests/`。
- 文档与注释以中文为主，技术标识符、命令、协议字段和外部 API 名称保留英文。

## 实施约束

- 生命周期、并发、子进程与关闭代码遵循 `deepseek-harness/docs/defensive-patterns.md`：关闭必须等待静止，独立结果分别报告，监听器异常不得破坏分发。
- Electron 渲染进程保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`，不得暴露通用 IPC、shell 或文件系统接口。
- 打包路径不得回退到系统 Node.js；独立 Node.js、Harness 依赖闭包和 Windows 启动器必须由版本清单定位并校验。
- 日志和诊断不得输出凭据、令牌、密码、完整环境或 `$DSH_HOME` 敏感内容。
- 非平凡架构或流程决策记录在 `.agents/notes/`，当前事实记录在 `docs/`，不得把计划描述成已交付行为。
- 使用 `apply_patch` 修改文件；不得提交、推送、签名或发布，除非用户当前指令明确授权。

## 验证

- 源码变更至少运行受影响测试、`pnpm run typecheck`、`pnpm run lint` 和 `git diff --check`。
- 运行时暂存或打包变更必须额外验证版本清单、资源哈希、生产依赖闭包和已安装入口。
- Windows 启动器必须验证正常退出、超时终止、父进程消失、后代清理、含空格和非 ASCII 路径。

