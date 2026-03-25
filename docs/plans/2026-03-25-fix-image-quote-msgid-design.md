# 修复引用自己发送图片消息的 bug

Issue: #11

## 问题

通过 MoreChat 发送图片时，`sendImageMessage` 提取了 juhexbot API 响应中的 `msgId`（客户端本地 ID，如 `881222943`），而非 `newMsgId`（微信服务端 ID，如 `4877500997370050015`）。

引用该图片时，`refer_msg.msg_id` 传了客户端 ID，微信无法正确定位原始消息，导致引用显示异常。

## 根因

`sendImageMessage` 的 msgId 提取逻辑只检查 `msg_id` / `msgId`，不检查 `newMsgId`。而 `sendTextMessage` 已正确处理了 `newMsgId` 和 `list[0].newMsgId`。

API 实际响应：
```json
{
  "baseResponse": {"ret": 0},
  "msgId": 881222943,                // 客户端 ID
  "newMsgId": "4877500997370050015", // 服务端 ID ← 应该用这个
  ...
}
```

## 设计

抽取公共的 `extractMsgId` 函数，统一 `sendTextMessage` 和 `sendImageMessage` 的 msgId 提取逻辑。

### 改动

**`apps/server/src/services/juhexbotAdapter.ts`**

1. 新增私有方法 `extractMsgId(data: any): string`：
   - 优先 `newMsgId`（服务端 ID）
   - 其次 `msg_id` / `msgId`（兼容旧格式）
   - 其次 `list[0].newMsgId` / `list[0].msgId` / `list[0].msg_id`
   - 未找到则抛错

2. `sendTextMessage`、`sendImageMessage`、`sendReferMessage` 统一调用 `extractMsgId(result.data)`

### 优先级变更

原来 `sendTextMessage`：
```
msg_id → msgId → newMsgId → list[0].newMsgId → list[0].msgId → list[0].msg_id
```

修复后统一为：
```
newMsgId → list[0].newMsgId → msg_id → msgId → list[0].msgId → list[0].msg_id
```

`newMsgId` 优先，因为它是微信服务端分配的稳定 ID。
