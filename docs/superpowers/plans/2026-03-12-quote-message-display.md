# 引用消息展示 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持在 MoreChat 中接收和展示微信引用（回复）消息。

**Architecture:** 后端 `messageContentProcessor` 检测 `appmsg.type=57` 并解析 `<refermsg>` 块，输出 `displayType: 'quote'` 和结构化 `referMsg` 对象。透传到 API 响应后，前端在 `MessageItem` 中渲染引用块 + 正文。

**Tech Stack:** TypeScript, Hono, fast-xml-parser, React, TailwindCSS

**Spec:** `docs/superpowers/specs/2026-03-12-quote-message-display-design.md`

---

## Chunk 1: 后端解析

### Task 1: messageContentProcessor — 类型与引用解析

**Files:**
- Modify: `apps/server/src/services/messageContentProcessor.ts`
- Modify: `apps/server/src/services/messageContentProcessor.test.ts`

- [ ] **Step 1: 写失败测试 — 引用文本消息**

在 `messageContentProcessor.test.ts` 末尾（`parseImageXml` describe 之前）添加：

```typescript
describe('Type 49 - Quote (type 57)', () => {
  const makeQuoteXml = (title: string, referType: number, svrid: string, displayname: string, referContent: string) => `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>${title}</title>
    <type>57</type>
    <refermsg>
      <type>${referType}</type>
      <svrid>${svrid}</svrid>
      <fromusr>chatroom@chatroom</fromusr>
      <chatusr>wxid_sender</chatusr>
      <displayname>${displayname}</displayname>
      <content>${referContent}</content>
    </refermsg>
  </appmsg>
</msg>`

  it('should parse quote message referencing text', () => {
    const xml = makeQuoteXml('我的回复', 1, '123456', '张三', '原始消息内容')
    const result = processMessageContent(49, xml)
    expect(result).toEqual({
      displayType: 'quote',
      displayContent: '我的回复',
      referMsg: {
        type: 1,
        senderName: '张三',
        content: '原始消息内容',
        msgId: '123456',
      },
    })
  })

  it('should show [图片] for image reference', () => {
    const xml = makeQuoteXml('看这个', 3, '789', '李四', '&lt;msg&gt;&lt;img aeskey="abc"/&gt;&lt;/msg&gt;')
    const result = processMessageContent(49, xml)
    expect(result.displayType).toBe('quote')
    expect(result.referMsg?.content).toBe('[图片]')
  })

  it('should extract title for type 49 reference', () => {
    const innerXml = '&lt;?xml version="1.0"?&gt;&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;文章标题&lt;/title&gt;&lt;type&gt;5&lt;/type&gt;&lt;/appmsg&gt;&lt;/msg&gt;'
    const xml = makeQuoteXml('转发了', 49, '456', '王五', innerXml)
    const result = processMessageContent(49, xml)
    expect(result.displayType).toBe('quote')
    expect(result.referMsg?.content).toBe('文章标题')
  })

  it('should show [视频] for video reference', () => {
    const xml = makeQuoteXml('好看', 43, '111', '赵六', '视频内容')
    const result = processMessageContent(49, xml)
    expect(result.referMsg?.content).toBe('[视频]')
  })

  it('should show [表情] for sticker reference', () => {
    const xml = makeQuoteXml('哈哈', 47, '222', '钱七', '表情内容')
    const result = processMessageContent(49, xml)
    expect(result.referMsg?.content).toBe('[表情]')
  })

  it('should fallback to [消息] for unknown ref type', () => {
    const xml = makeQuoteXml('啥', 999, '333', '孙八', '未知内容')
    const result = processMessageContent(49, xml)
    expect(result.referMsg?.content).toBe('[消息]')
  })

  it('should use 未知用户 when displayname is empty', () => {
    const xml = makeQuoteXml('回复', 1, '444', '', '内容')
    const result = processMessageContent(49, xml)
    expect(result.referMsg?.senderName).toBe('未知用户')
  })

  it('should use [消息] when ref content is empty', () => {
    const xml = makeQuoteXml('回复', 1, '555', '某人', '')
    const result = processMessageContent(49, xml)
    expect(result.referMsg?.content).toBe('[消息]')
  })

  it('should degrade to link when refermsg is missing', () => {
    const xml = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>无引用的57</title>
    <type>57</type>
  </appmsg>
</msg>`
    const result = processMessageContent(49, xml)
    expect(result).toEqual({ displayType: 'link', displayContent: '无引用的57' })
  })

  it('should handle nested quote (ref type 49 with inner refermsg) by extracting title only', () => {
    const innerXml = '&lt;?xml version="1.0"?&gt;&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;内层标题&lt;/title&gt;&lt;type&gt;57&lt;/type&gt;&lt;refermsg&gt;&lt;type&gt;1&lt;/type&gt;&lt;content&gt;深层内容&lt;/content&gt;&lt;/refermsg&gt;&lt;/appmsg&gt;&lt;/msg&gt;'
    const xml = makeQuoteXml('外层回复', 49, '777', '嵌套者', innerXml)
    const result = processMessageContent(49, xml)
    expect(result.displayType).toBe('quote')
    expect(result.referMsg?.content).toBe('内层标题')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/server && npx vitest run src/services/messageContentProcessor.test.ts
```

预期：新增的 `Type 49 - Quote (type 57)` 测试全部 FAIL。

- [ ] **Step 3: 实现引用消息解析**

修改 `apps/server/src/services/messageContentProcessor.ts`：

1) 更新 `DisplayType`：

```typescript
export type DisplayType = 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'unknown'
```

2) 新增 `ReferMsg` 接口和更新 `ProcessedContent`：

```typescript
export interface ReferMsg {
  type: number
  senderName: string
  content: string
  msgId: string
}

export interface ProcessedContent {
  displayType: DisplayType
  displayContent: string
  referMsg?: ReferMsg
}
```

3) 新增 `summarizeReferContent` 函数（在 `processType49` 之前）：

```typescript
function summarizeReferContent(type: number, rawContent: string): string {
  if (!rawContent || !rawContent.trim()) return '[消息]'

  switch (type) {
    case 1:
      return rawContent.trim()
    case 3:
      return '[图片]'
    case 43:
      return '[视频]'
    case 47:
      return '[表情]'
    case 49: {
      const parsed = parseXml(rawContent)
      const title = parsed?.msg?.appmsg?.title
      return title ? String(title).trim() : '[链接]'
    }
    default:
      return '[消息]'
  }
}
```

4) 修改 `processType49`，在 finderFeed 检测之前插入 type=57 检测：

```typescript
function processType49(content: string): ProcessedContent {
  const parsed = parseXml(content)
  if (!parsed) {
    return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }

  const appmsg = parsed?.msg?.appmsg
  if (!appmsg) {
    return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }

  // 引用消息：appmsg.type === 57
  if (String(appmsg.type) === '57') {
    const title = appmsg.title ? String(appmsg.title).trim() : ''
    const refermsg = appmsg.refermsg
    if (!refermsg) {
      return { displayType: 'link', displayContent: title || '[链接]' }
    }

    const refType = Number(refermsg.type) || 0
    const rawRefContent = refermsg.content ? String(refermsg.content) : ''
    const displayname = refermsg.displayname ? String(refermsg.displayname).trim() : ''

    return {
      displayType: 'quote',
      displayContent: title,
      referMsg: {
        type: refType,
        senderName: displayname || '未知用户',
        content: summarizeReferContent(refType, rawRefContent),
        msgId: refermsg.svrid ? String(refermsg.svrid) : '',
      },
    }
  }

  // Check for finderFeed (video channel)
  const finderFeed = appmsg.finderFeed
  if (finderFeed && finderFeed.nickname) {
    const nickname = String(finderFeed.nickname).trim()
    const desc = String(finderFeed.desc || '').trim()
    if (nickname) {
      const summary = desc ? `${nickname}: ${desc}` : nickname
      return { displayType: 'video', displayContent: `[视频号] ${summary}` }
    }
  }

  // Default: use title
  const title = appmsg.title ? String(appmsg.title).trim() : ''
  return {
    displayType: 'link',
    displayContent: title || '[链接]',
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/server && npx vitest run src/services/messageContentProcessor.test.ts
```

预期：全部 PASS。

- [ ] **Step 5: 运行全部后端测试确认无回归**

```bash
cd apps/server && npx vitest run
```

预期：全部 PASS。

- [ ] **Step 6: 提交**

```bash
cd apps/server
git add src/services/messageContentProcessor.ts src/services/messageContentProcessor.test.ts
git commit -m "feat: parse quote messages (appmsg type 57) in messageContentProcessor"
```

---

### Task 2: 后端 API 透传 referMsg

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/services/conversationService.ts`

- [ ] **Step 1: 修改 message.ts — IncomingMessageResult 和透传**

在 `IncomingMessageResult.message` 接口中新增可选字段：

```typescript
export interface IncomingMessageResult {
  conversationId: string
  message: {
    // ...existing fields
    displayType: string
    displayContent: string
    referMsg?: {
      type: number
      senderName: string
      content: string
      msgId: string
    }
  }
}
```

在 `handleIncomingMessage` 中，将 `processMessageContent` 的返回值解构改为：

```typescript
const { displayType, displayContent, referMsg } = processMessageContent(message.msgType, message.content)
```

在 return 对象中添加 `referMsg`（在 `displayContent` 之后）：

```typescript
return {
  conversationId: conversation.id,
  message: {
    // ...existing fields
    displayType,
    displayContent,
    referMsg,
  }
}
```

- [ ] **Step 2: 修改 conversationService.ts — getMessages 透传**

在 `getMessages` 的 `rawMessages.map` 中：

```typescript
const { displayType, displayContent, referMsg } = processMessageContent(msg.msg_type, msg.content)
return {
  // ...existing fields
  displayType,
  displayContent,
  referMsg,
}
```

- [ ] **Step 3: 运行全部后端测试**

```bash
cd apps/server && npx vitest run
```

预期：全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/conversationService.ts
git commit -m "feat: pass referMsg through API responses"
```

---

## Chunk 2: 前端展示

### Task 3: 前端类型与数据映射

**Files:**
- Modify: `apps/web/src/types/index.ts`
- Modify: `apps/web/src/api/chat.ts`

- [ ] **Step 1: 更新前端 Message 类型**

`apps/web/src/types/index.ts`：

新增 `ReferMsg` 接口，`Message` 增加 `referMsg` 和 `'quote'`：

```typescript
export interface ReferMsg {
  type: number;
  senderName: string;
  content: string;
  msgId: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  status: 'sending' | 'sent' | 'failed';
  isMine: boolean;
  msgType?: number;
  displayType?: 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'unknown';
  referMsg?: ReferMsg;
}
```

- [ ] **Step 2: 更新 ApiMessage 和 mapMessage**

`apps/web/src/api/chat.ts`：

`ApiMessage` 新增：

```typescript
export interface ApiMessage {
  // ...existing fields
  referMsg?: {
    type: number;
    senderName: string;
    content: string;
    msgId: string;
  };
}
```

`mapMessage` return 中新增：

```typescript
referMsg: raw.referMsg,
```

- [ ] **Step 3: 类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/types/index.ts apps/web/src/api/chat.ts
git commit -m "feat: add ReferMsg type and API mapping for quote messages"
```

---

### Task 4: MessageItem 引用消息渲染

**Files:**
- Modify: `apps/web/src/components/chat/MessageItem.tsx`

- [ ] **Step 1: 在 renderContent 中新增 quote 分支**

在 `MessageItem.tsx` 的 `renderContent` 函数中，`displayType === 'image'` 分支之后、最终 fallback 之前，添加：

```tsx
if (displayType === 'quote') {
  return (
    <div>
      {message.referMsg && (
        <div className="border-l-2 border-gray-300 pl-2 mb-1">
          <span className="text-xs text-gray-500">{message.referMsg.senderName}</span>
          <p className="text-sm text-gray-500 line-clamp-2">{message.referMsg.content}</p>
        </div>
      )}
      <span>{content}</span>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 3: 构建验证**

```bash
pnpm build
```

预期：构建成功。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/chat/MessageItem.tsx
git commit -m "feat: render quote messages with reference block in MessageItem"
```
