import { createInterface } from 'node:readline'
import { parseControlMessage } from './protocol.js'

const listenerDeadlineMs = 1500
let shutdownRequested = false

function requestShutdown(): void {
  if (shutdownRequested) return
  shutdownRequested = true
  const deadline = Date.now() + listenerDeadlineMs

  const emitWhenOwned = (): void => {
    if (process.listenerCount('SIGTERM') > 0) {
      process.emit('SIGTERM', 'SIGTERM')
      return
    }
    if (Date.now() >= deadline) {
      process.stderr.write('dsh-desktop bootstrap: shutdown handler unavailable\n')
      process.exit(1)
    }
    setTimeout(emitWhenOwned, 25)
  }
  emitWhenOwned()
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
input.on('line', line => {
  try {
    parseControlMessage(line)
    requestShutdown()
  } catch {
    // 输入只来自桌面监管器；拒绝格式错误的消息，但不回显其潜在敏感内容。
    process.stderr.write('dsh-desktop bootstrap: invalid control message\n')
  }
})
input.on('close', requestShutdown)
process.stdin.resume()

