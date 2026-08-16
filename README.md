# DSH Desktop

DSH Desktop 是 DeepSeek Harness 的 Windows 桌面伴生项目。它把官方、精确版本的 `@deepseek-ai/dsh` 作为外部运行时启动，并在沙箱化 Electron 窗口中加载现有 Web 产品；`deepseek-harness/` 只作为被忽略的上游参考检出。

## 当前状态

实施进行中。精确运行时、Windows Job Object 监管器、安全桌面窗口、不可变候选目录、全量文件索引、第三方组件清单、签名发行门禁、上游版本候选和稳定/上一版回滚指针已经实现。当前清洁构建已通过 34,850 个运行时文件的应用与内部安装器双重审计；Node.js 与 Electron 下载 ZIP 均不进入应用。真实打包候选已通过完整插件加载、会话创建、流式事件、renderer 刷新、隔离 `$DSH_HOME` 重启持久化和故障页验证。

Windows EXE、窗口、Squirrel Setup、启动页和错误页共用同一蓝色角色图标体系；透明母版、多尺寸 PNG、ICO、视觉检查表和哈希清单见[图标资源](assets/icons/README.md)。

当前工作树仍不是可发布产品：没有可用的代码签名证书，尚未取得 Windows 10/11 干净虚拟机、真实模型流式回答、上一签名版本升级/回滚和 SmartScreen 或组织指定发布扫描证据；本机旧内部安装器卸载后还出现 Squirrel 延迟删除残留。当前未签名安装器已有一次可追溯的 Microsoft Defender 自定义扫描零匹配记录。

## 固定版本

| 组件 | 版本 | 作用 |
| --- | --- | --- |
| DeepSeek Harness | `0.1.0-rc.6` | 当前官方 npm 最新发布物，作为唯一产品运行时。 |
| Node.js | `24.11.1` | 独立运行 Harness，避免 Electron ABI 影响。 |
| Electron | `43.4.0` | 提供 Windows 窗口、桌面生命周期和安装包外壳。 |
| Electron Forge | `7.11.2` | 驱动 Squirrel 安装器；应用目录由底层 Electron Packager 生成。 |
| pnpm | `11.7.0` | 以冻结锁文件解析桌面与 Harness 部署依赖。 |

精确版本同时记录在 `desktop.config.json`、workspace 依赖和锁文件中；版本一致性由暂存脚本校验。升级 Harness 必须形成独立候选变更并重新执行兼容性门禁。

## 开发入口

```powershell
corepack pnpm install
corepack pnpm run check
corepack pnpm run stage:runtime
corepack pnpm run smoke:launcher
corepack pnpm run smoke:native
corepack pnpm run smoke:runtime
corepack pnpm run package:win
corepack pnpm run audit:package
corepack pnpm run smoke:packaged
corepack pnpm start
```

`stage:runtime` 会核对官方 npm tarball 与 SRI，从冻结锁文件部署 Harness 生产依赖，校验官方 Node.js 和 Electron Windows x64 发行物，生成第三方组件清单、全量 SHA-256 文件索引和运行时身份。部署后会确认运行闭包不再依赖 pnpm 链接。下载缓存不进入安装包，缓存命中后仍会重新校验内容。

## 文档

- [架构](docs/architecture.md)
- [开发流程](docs/development.md)
- [运维参考](docs/operations.md)
- [发布流程](docs/release.md)
- [验收状态](docs/acceptance.md)
- [实施决策](.agents/notes/proposed/architecture/2026-08-14-upstream-compatible-windows-desktop.md)
- [上游计划](deepseek-harness/docs/changes/001-upstream-compatible-windows-desktop/README.zh.md)
