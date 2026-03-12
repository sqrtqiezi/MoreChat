# 引用消息展示设计

## 概述

支持在 MoreChat 中接收和展示微信引用（回复）消息。仅涉及接收/展示，不涉及发送引用消息。

## 数据来源

微信引用消息的原始结构：
- 外层：`msg_type=49`，`appmsg.type=57`
- `<title>`：引用者发送的新消息文本
- `<refermsg>` 块包含被引用消息信息：
  - `<type>`：被引用消息类型（1=文本, 3=图片, 49=链接, 43=视频, 47=表情）
  - `<svrid>`：被引用消息的 msgId
  - `<chatusr>`：被引用消息的实际发送者 wxid
  - `<displayname>`：发送者昵称
  - `<content>`：被引用消息的原始内容
  - `<createtime>`：被引用消息的时间戳

生产数据分布（2026-03-11 ~ 03-12）：
- type=1（文本）：1443 条
- type=49（链接/应用）：672 条
- type=3（图片）：406 条
- type=43（视频）：27 条
- type=47（表情）：10 条

## 后端设计

### 类型定义

`messageContentProcessor.ts` 新增：

```typescript
export type DisplayType = 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'unknown'

export interface ReferMsg {
  type: number        // 被引用消息类型
  senderName: string  // displayname
  content: string     // 处理后的摘要文本
  msgId: string       // svrid
}

export interface ProcessedContent {
  displayType: DisplayType
  displayContent: string
  referMsg?: ReferMsg
}
```

### 解析逻辑

在 `processType49` 中，优先检测 `appmsg.type === 57`：

1. 提取 `<title>` 作为 `displayContent`（引用者发的新文本）
2. 提取 `<refermsg>` 块，解析 `type`、`svrid`、`displayname`、`content`
3. 对 `refermsg.content` 按类型做二次处理：
   - `type=1` → 直接使用文本
   - `type=3` → `[图片]`
   - `type=49` → 尝试解析内层 XML 取 title，失败则 `[链接]`
   - `type=43` → `[视频]`
   - `type=47` → `[表情]`
   - 其他 → `[消息]`

### API 输出

`message.ts` 和 `conversationService.ts` 透传 `referMsg` 字段到 API 响应。

## 前端设计

### 类型定义

`types/index.ts`：

```typescript
export interface ReferMsg {
  type: number
  senderName: string
  content: string
  msgId: string
}

export interface Message {
  // ...existing fields
  displayType?: 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'unknown'
  referMsg?: ReferMsg
}
```

### 数据映射

`api/chat.ts` 的 `ApiMessage` 新增可选 `referMsg` 字段，`mapMessage` 中直接透传。

### UI 渲染

`MessageItem.tsx` 的 `renderContent` 新增 `quote` 分支：

- 引用块：左侧竖线（`border-l-2 border-gray-300`），灰色文字
- 上方显示被引用者昵称（`text-xs text-gray-500`）
- 下方显示引用内容摘要，最多 2 行（`line-clamp-2`）
- 引用块下方紧跟引用者发的新消息正文
- 自己和他人的消息气泡中引用块样式一致

## 错误处理

- **refermsg 解析失败**：降级为 `displayType: 'link'`，`displayContent` 取 `<title>` 或 `[链接]`，不返回 `referMsg`
- **refermsg.content 为空**：显示 `[消息]`
- **refermsg.displayname 为空**：显示 `未知用户`
- **嵌套引用**（refermsg.type=49 且内层也有 refermsg）：只解析一层，内层取 `<title>` 作为摘要
- **前端 referMsg 为 undefined**：`quote` 类型但无 referMsg 时，仅显示正文

## 涉及文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/services/messageContentProcessor.ts` | 新增 `ReferMsg` 类型，`processType49` 增加 type=57 分支 |
| `apps/server/src/services/message.ts` | 透传 `referMsg` |
| `apps/server/src/services/conversationService.ts` | 透传 `referMsg` |
| `apps/web/src/types/index.ts` | 新增 `ReferMsg`，`Message` 增加 `referMsg` 和 `quote` 类型 |
| `apps/web/src/api/chat.ts` | `ApiMessage` 增加 `referMsg`，`mapMessage` 透传 |
| `apps/web/src/components/chat/MessageItem.tsx` | `renderContent` 新增 `quote` 渲染分支 |

## 不在范围内

- 发送引用消息
- 点击引用跳转到原消息（`msgId` 已预留）
- 引用消息的搜索/过滤
