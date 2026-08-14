# Harness 运行时暂存包

本 workspace 只声明桌面安装包使用的精确 `@deepseek-ai/dsh` 版本。`pnpm deploy --prod` 从根锁文件生成独立、可复制的生产依赖闭包；桌面代码不得直接导入该包，也不得在此覆盖上游文件。

