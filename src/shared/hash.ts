import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/**
 * 计算文件的 SHA-256 十六进制摘要。
 * @param path - 要读取的文件绝对路径。
 * @returns 小写十六进制摘要。
 */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

