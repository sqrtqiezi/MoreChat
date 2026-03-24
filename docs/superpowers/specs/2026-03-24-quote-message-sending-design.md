# 发送引用消息 设计文档

## 概述

在聊天窗口中支持引用回复消息。用户悬停消息时出现回复按钮，点击后在输入框上方显示引用预览条，输入文字后发送引用消息。

## 交互流程

1. 鼠标悬停消息气泡 → 右上角浮现回复图标按钮
2. 点击回复按钮 → 输入框上方出现引用预览条（发送者名 + 内容摘要 + 关闭按钮）
3. 用户输入文字 → Enter 或点击发送
4. 发送成功 → 清除引用状态，消息以 quote 类型显示

## 状态管理

`ChatWindow` 新增 `replyingTo: Message | null` 状态：
- `MessageList` 接收 `onReply(message)` 回调
- `MessageItem` hover 时显示回复按钮，点击触发 `onReply`
- `MessageInput` 接收 `replyingTo` 和 `onCancelReply`

## API 设计

### 前端请求

```
POST /api/messages/send
{
  conversationId: string,
  content: string,
  replyToMsgId?: string    // 被引用消息的 msgId（可选）
}
```

### 后端处理

收到 `replyToMsgId` 时：
1. 从 MessageIndex 查找被引用消息的元数据
2. 从 DataLake 获取原始消息内容
3. 从 Contact 表获取发送者昵称
4. 调用 juhexbot `/msg/send_refer_msg`

### juhexbot API

```
POST /msg/send_refer_msg
{
  guid: string,
  to_username: string,
  content: string,
  refer_msg: {
    msg_type: number,
    msg_id: string,
    from_username: string,
    from_nickname: string,
    source: string,
    content: string
  }
}
```

## 乐观更新

发送时立即构造 quote 类型临时消息：
- `displayType: 'quote'`
- `referMsg`: 从当前选中消息提取 `{ type: msgType, senderName, content, msgId }`

## 文件改动

| 文件 | 改动 |
|------|------|
| `ChatWindow.tsx` | 新增 `replyingTo` state，传递给子组件 |
| `MessageItem.tsx` | hover 时显示回复按钮 |
| `MessageInput.tsx` | 显示引用预览条，发送时附带 `replyToMsgId` |
| `useSendMessage.ts` | 支持 `replyToMsgId` 和 `replyingTo`，乐观更新构造 quote 消息 |
| `chat.ts` (前端 API) | `sendMessage` 支持 `replyToMsgId` |
| `juhexbotAdapter.ts` | 新增 `sendReferMessage()` |
| `message.ts` (service) | `sendMessage` 支持引用，从 DataLake 获取原始消息 |
| `messages.ts` (route) | 接收 `replyToMsgId` 参数 |
