// 管理待确认的消息 ID，用于 WebSocket 去重
const pendingMsgIds = new Set<string>()
const timeouts = new Map<string, NodeJS.Timeout>()

export const addPendingMsgId = (msgId: string) => {
  pendingMsgIds.add(msgId)

  // 30 秒后自动清除
  const timeout = setTimeout(() => {
    pendingMsgIds.delete(msgId)
    timeouts.delete(msgId)
  }, 30000)

  timeouts.set(msgId, timeout)
}

export const hasPendingMsgId = (msgId: string): boolean => {
  return pendingMsgIds.has(msgId)
}

export const removePendingMsgId = (msgId: string) => {
  pendingMsgIds.delete(msgId)
  const timeout = timeouts.get(msgId)
  if (timeout) {
    clearTimeout(timeout)
    timeouts.delete(msgId)
  }
}

export const consumePendingMsgId = (msgId: string): boolean => {
  if (!pendingMsgIds.has(msgId)) return false
  removePendingMsgId(msgId)
  return true
}
