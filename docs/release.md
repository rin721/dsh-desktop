# DSH Desktop 发布流程

## 产物级别

`package:win` 生成不可覆盖的应用目录，`make:win` 生成未签名内部安装器并执行结构审计。内部产物只用于诊断和兼容性验收，不得提升为生产版本。生产候选必须由受保护的 Windows 签名环境执行 `release:win`，通过 Authenticode、完整包、发行清单、安装和卸载门禁后仍需人工批准。

每个候选位于 `out/candidates/<桌面版本>-<构建标识>/`。构建标识覆盖桌面编译产物、产品配置、运行时索引和第三方声明；已有候选拒绝覆盖。

## 官方供应与备用边界

正常更新只接受 npm 官方 `@deepseek-ai/dsh` 精确版本、官方 tarball URL、SRI 和已提交冻结锁文件。`desktop.config.json`、`packages/harness-runtime/package.json` 和 `pnpm-lock.yaml` 必须一致。

当前仓库没有从 Harness 源码标签或提交构建的发布实现，也绝不在 npm 不可用时自动回退。启用源码备用路线需要新的明确批准，并必须在独立变更中记录源码仓库、精确修订、干净检出、构建命令、产物哈希、依赖闭包和与官方包的差异；未取得这些证据时候选失败关闭。

## 内部候选

```powershell
corepack pnpm run package:win
corepack pnpm run audit:package
corepack pnpm run smoke:packaged
corepack pnpm run make:win
corepack pnpm run scan:defender
corepack pnpm run audit:defender
corepack pnpm run smoke:installer
```

内部安装器审计交叉校验 `RELEASES`、完整包大小与哈希、构建身份和 34,850 个运行时文件。NuGet 为真实空目录生成的零字节 `_._` 只有在候选对应目录存在且为空、解包目录没有其他条目时才会被归一化；其他链接、标记或额外文件仍然失败。

## 签名候选

```powershell
corepack pnpm run release:win
corepack pnpm run verify:release
```

`release:win` 从绝对 `WINDOWS_CERTIFICATE_FILE` 和 `WINDOWS_CERTIFICATE_PASSWORD` 读取证书与口令，缺失时在修改发行产物前失败，且日志不输出秘密。执行顺序是运行时暂存与冒烟、launcher 签名、重写运行时索引和身份、应用打包、应用 EXE 签名、包审计与 E2E、Squirrel 签名安装器、解包复验、Defender 扫描和安装卸载 smoke。Setup.exe、应用 EXE 和 launcher 都必须通过 Authenticode `/pa /all`；Defender 必须启用、扫描命令必须成功、候选路径的匹配威胁检测数必须为零，并写出绑定安装器 SHA-256 的非生产扫描证据。

`.github/workflows/signed-candidate.yml` 只接受手动触发和受保护 `windows-signing` 环境，固定 Node.js、pnpm 与 Rust，运行源码、依赖审计和完整发行门禁，最后上传待审批候选。上传不等于稳定发布，工作流总会尝试删除临时证书文件。

## 上游候选

```powershell
corepack pnpm run check:upstream
corepack pnpm run update:harness -- <精确版本>
```

每周工作流只在 npm `latest` 与当前精确版本不同且没有同分支开放拉取请求时创建候选。候选原子更新版本、tarball、SRI 和锁文件，并运行源码、依赖审计、launcher、原生模块、真实 runtime、应用包、窗口 E2E、内部安装器结构和安装卸载门禁；失败时不提交、不推送、不发布。

## 提升与回滚

```powershell
corepack pnpm run promote:release -- --confirm-build <构建标识>
corepack pnpm run rollback:release -- --confirm-build <上一构建标识>
```

提升要求确认值精确匹配当前候选，并再次验证发行清单、所有产物哈希和 Setup.exe 签名。`out/channels/channel-state.json` 通过一次原子替换同时保存 `stable` 和可选 `previous` 指针；候选文件不搬移、不覆盖。回滚要求精确确认 `previous` 构建并复验两个指针，只交换二进制指针，不修改或降级 `$DSH_HOME`。

## CI 与发布批准

普通 Windows CI 与上游候选已配置为在干净 `windows-latest` 运行内部安装、卸载和无残留门禁，但不签名；当前工作树尚无远端运行记录。受保护签名流程已包含 Defender 扫描，但生产发布仍必须补齐 Windows 10/11 x64 记录、专用测试凭据下的真实模型流式回答、上一签名版本升级与回滚、第三方许可证复核、SmartScreen 或组织指定的补充扫描，以及明确发布批准。当前缺口见[验收状态](acceptance.md)。
