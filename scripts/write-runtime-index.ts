import { runtimeRoot } from './lib/project.js'
import { writeRuntimeFileIndex } from './lib/runtime-index.js'

const index = await writeRuntimeFileIndex(runtimeRoot)
console.log(`完整运行时索引已生成：${index.files.length} 个文件。`)
