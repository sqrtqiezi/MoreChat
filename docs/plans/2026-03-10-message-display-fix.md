# Message Display Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix message display so non-text messages (image, link, call, recall) show readable summaries instead of raw XML.

**Architecture:** Backend pre-processes message content in `conversationService.getMessages()` using a new `messageContentProcessor` module. Each message type gets a handler that extracts human-readable text. Frontend receives `displayType` and `displayContent` fields and renders accordingly.

**Tech Stack:** TypeScript, Node.js `fast-xml-parser` for XML parsing, Vitest for tests, React for frontend rendering.

---

### Task 1: Install fast-xml-parser dependency

**Files:**
- Modify: `apps/server/package.json`

**Step 1: Install the package**

Run: `cd apps/server && pnpm add fast-xml-parser`

**Step 2: Verify installation**

Run: `cd apps/server && node -e "const { XMLParser } = require('fast-xml-parser'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add apps/server/package.json pnpm-lock.yaml
git commit -m "feat: add fast-xml-parser dependency for message content processing"
```

---

### Task 2: Create messageContentProcessor with tests (TDD)

**Files:**
- Create: `apps/server/src/services/messageContentProcessor.ts`
- Create: `apps/server/src/services/messageContentProcessor.test.ts`

**Step 1: Write failing tests**

Create `apps/server/src/services/messageContentProcessor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { processMessageContent } from './messageContentProcessor.js'

describe('processMessageContent', () => {
  describe('Type 1 - Text', () => {
    it('should return text content as-is', () => {
      const result = processMessageContent(1, '你好世界')
      expect(result).toEqual({ displayType: 'text', displayContent: '你好世界' })
    })

    it('should handle empty text', () => {
      const result = processMessageContent(1, '')
      expect(result).toEqual({ displayType: 'text', displayContent: '' })
    })
  })

  describe('Type 3 - Image', () => {
    it('should return image placeholder', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<img aeskey="abc" cdnthumburl="http://example.com/thumb" />\n</msg>'
      const result = processMessageContent(3, xmlContent)
      expect(result).toEqual({ displayType: 'image', displayContent: '[图片]' })
    })
  })

  describe('Type 49 - App/Link/File', () => {
    it('should extract title from appmsg', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title>测试链接标题</title>\n\t\t<type>5</type>\n\t\t<url>https://example.com</url>\n\t</appmsg>\n</msg>'
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({ displayType: 'link', displayContent: '测试链接标题' })
    })

    it('should extract finderFeed info for video type', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title>当前版本不支持展示该内容</title>\n\t\t<type>51</type>\n\t\t<finderFeed>\n\t\t\t<nickname>小明</nickname>\n\t\t\t<desc>有趣的视频</desc>\n\t\t</finderFeed>\n\t</appmsg>\n</msg>'
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({ displayType: 'video', displayContent: '[视频号] 小明: 有趣的视频' })
    })

    it('should fallback to title when finderFeed has no nickname', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title>分享的文章</title>\n\t\t<type>51</type>\n\t\t<finderFeed>\n\t\t\t<nickname></nickname>\n\t\t</finderFeed>\n\t</appmsg>\n</msg>'
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({ displayType: 'link', displayContent: '分享的文章' })
    })

    it('should handle XML parse failure gracefully', () => {
      const result = processMessageContent(49, 'not xml at all')
      expect(result).toEqual({ displayType: 'unknown', displayContent: '[不支持的消息类型]' })
    })
  })

  describe('Type 51 - Voice/Video Call', () => {
    it('should return call placeholder', () => {
      const xmlContent = '<msg>\n<op id="5">\n<username>filehelper</username>\n</op>\n</msg>'
      const result = processMessageContent(51, xmlContent)
      expect(result).toEqual({ displayType: 'call', displayContent: '[语音/视频通话]' })
    })
  })

  describe('Type 10002 - Message Recall', () => {
    it('should extract replacemsg text', () => {
      const xmlContent = '<sysmsg type="revokemsg"><revokemsg><session>user1</session><replacemsg><![CDATA["小明" 撤回了一条消息]]></replacemsg></revokemsg></sysmsg>'
      const result = processMessageContent(10002, xmlContent)
      expect(result).toEqual({ displayType: 'recall', displayContent: '"小明" 撤回了一条消息' })
    })

    it('should handle missing replacemsg', () => {
      const xmlContent = '<sysmsg type="revokemsg"><revokemsg><session>user1</session></revokemsg></sysmsg>'
      const result = processMessageContent(10002, xmlContent)
      expect(result).toEqual({ displayType: 'recall', displayContent: '撤回了一条消息' })
    })
  })

  describe('Unknown types', () => {
    it('should return unknown for unrecognized msg type', () => {
      const result = processMessageContent(999, 'some content')
      expect(result).toEqual({ displayType: 'unknown', displayContent: '[不支持的消息类型]' })
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/services/messageContentProcessor.test.ts`
Expected: FAIL — module not found

**Step 3: Implement messageContentProcessor**

Create `apps/server/src/services/messageContentProcessor.ts`:

```typescript
import { XMLParser } from 'fast-xml-parser'

export type DisplayType = 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'unknown'

export interface ProcessedContent {
  displayType: DisplayType
  displayContent: string
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
})

function parseXml(content: string): any | null {
  try {
    return xmlParser.parse(content)
  } catch {
    return null
  }
}

function processType49(content: string): ProcessedContent {
  const parsed = parseXml(content)
  if (!parsed) {
    return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }

  const appmsg = parsed?.msg?.appmsg
  if (!appmsg) {
    return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }

  // Check for finderFeed (video channel) — type 51 within appmsg
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

function processType10002(content: string): ProcessedContent {
  const parsed = parseXml(content)
  const replacemsg = parsed?.sysmsg?.revokemsg?.replacemsg
  const text = replacemsg ? String(replacemsg).trim() : '撤回了一条消息'
  return { displayType: 'recall', displayContent: text }
}

export function processMessageContent(msgType: number, content: string): ProcessedContent {
  switch (msgType) {
    case 1:
      return { displayType: 'text', displayContent: content }
    case 3:
      return { displayType: 'image', displayContent: '[图片]' }
    case 49:
      return processType49(content)
    case 51:
      return { displayType: 'call', displayContent: '[语音/视频通话]' }
    case 10002:
      return processType10002(content)
    default:
      return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/services/messageContentProcessor.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/server/src/services/messageContentProcessor.ts apps/server/src/services/messageContentProcessor.test.ts
git commit -m "feat: add messageContentProcessor for parsing message types into display content"
```

---

### Task 3: Integrate processor into conversationService

**Files:**
- Modify: `apps/server/src/services/conversationService.ts`
- Modify: `apps/server/src/services/conversationService.test.ts`

**Step 1: Update the existing test for getMessages**

In `apps/server/src/services/conversationService.test.ts`, update the `expectedMessages` in the "should return paginated messages from DataLake" test to include `displayType` and `displayContent`:

```typescript
const expectedMessages = [
  { msgId: 'msg1', msgType: 1, fromUsername: 'user1', toUsername: 'user2', content: 'hello', createTime: 1000, chatroomSender: undefined, desc: undefined, isChatroomMsg: undefined, chatroom: undefined, source: undefined, displayType: 'text', displayContent: 'hello' },
  { msgId: 'msg2', msgType: 1, fromUsername: 'user2', toUsername: 'user1', content: 'world', createTime: 900, chatroomSender: undefined, desc: undefined, isChatroomMsg: undefined, chatroom: undefined, source: undefined, displayType: 'text', displayContent: 'world' }
]
```

Add a new test for non-text message processing:

```typescript
it('should process non-text messages with displayType and displayContent', async () => {
  const mockIndexes = [{ dataLakeKey: 'key1', createTime: 1000 }]
  const mockRawMessages = [
    { msg_id: 'msg1', msg_type: 3, from_username: 'user1', to_username: 'user2', content: '<?xml version="1.0"?><msg><img aeskey="abc"/></msg>', create_time: 1000 }
  ]

  vi.mocked(mockDb.getMessageIndexes).mockResolvedValue(mockIndexes)
  vi.mocked(mockDataLake.getMessages).mockResolvedValue(mockRawMessages)

  const result = await service.getMessages('conv_1', { limit: 50 })
  expect(result.messages[0].displayType).toBe('image')
  expect(result.messages[0].displayContent).toBe('[图片]')
})
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/server && npx vitest run src/services/conversationService.test.ts`
Expected: FAIL — messages don't have displayType/displayContent

**Step 3: Update conversationService.ts**

In `apps/server/src/services/conversationService.ts`, import the processor and add the fields to the message mapping:

```typescript
import { processMessageContent } from './messageContentProcessor.js'
```

Update the `messages` mapping inside `getMessages()`:

```typescript
const messages = rawMessages.map((msg: any) => {
  const { displayType, displayContent } = processMessageContent(msg.msg_type, msg.content)
  return {
    msgId: msg.msg_id,
    msgType: msg.msg_type,
    fromUsername: msg.from_username,
    toUsername: msg.to_username,
    content: msg.content,
    createTime: msg.create_time,
    chatroomSender: msg.chatroom_sender,
    desc: msg.desc,
    isChatroomMsg: msg.is_chatroom_msg,
    chatroom: msg.chatroom,
    source: msg.source,
    displayType,
    displayContent,
  }
})
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/server && npx vitest run src/services/conversationService.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add apps/server/src/services/conversationService.ts apps/server/src/services/conversationService.test.ts
git commit -m "feat: integrate messageContentProcessor into conversationService"
```

---

### Task 4: Update frontend types and API mapping

**Files:**
- Modify: `apps/web/src/types/index.ts`
- Modify: `apps/web/src/api/chat.ts`

**Step 1: Update Message interface**

In `apps/web/src/types/index.ts`, add `msgType` and `displayType` to Message:

```typescript
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: string;
  msgType: number;
  displayType: 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'unknown';
  timestamp: string;
  status: 'sending' | 'sent' | 'failed';
  isMine: boolean;
}
```

**Step 2: Update ApiMessage and mapMessage in chat.ts**

In `apps/web/src/api/chat.ts`, add new fields to `ApiMessage`:

```typescript
interface ApiMessage {
  msgId: string;
  msgType: number;
  fromUsername: string;
  toUsername: string;
  content: string;
  createTime: number;
  chatroomSender?: string;
  displayType: 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'unknown';
  displayContent: string;
}
```

Update `mapMessage()` to use `displayContent` as `content` and pass through `msgType` and `displayType`:

```typescript
function mapMessage(raw: ApiMessage, conversationId: string, contactNameMap: Map<string, string>): Message {
  const isMine = raw.fromUsername === CURRENT_USER;

  return {
    id: raw.msgId,
    conversationId,
    senderId: raw.fromUsername,
    senderName: isMine ? '我' : (contactNameMap.get(raw.fromUsername) || raw.fromUsername),
    content: raw.displayContent ?? raw.content,
    msgType: raw.msgType,
    displayType: raw.displayType ?? 'text',
    timestamp: new Date(raw.createTime * 1000).toISOString(),
    status: 'sent',
    isMine,
  };
}
```

**Step 3: Commit**

```bash
git add apps/web/src/types/index.ts apps/web/src/api/chat.ts
git commit -m "feat: update frontend types and API mapping for displayType/displayContent"
```

---

### Task 5: Update MessageItem rendering

**Files:**
- Modify: `apps/web/src/components/chat/MessageItem.tsx`

**Step 1: Update MessageItem to style non-text messages**

Add a helper to check if the message is a placeholder type, and render those in gray italic:

In the component, replace `{content}` in both the isMine and !isMine branches with a `renderContent()` call:

```typescript
const renderContent = () => {
  if (message.displayType === 'text') {
    return content;
  }
  // Non-text: show as gray italic placeholder
  return <span className="italic text-gray-500">{content}</span>;
};
```

Replace `{content}` with `{renderContent()}` in both message bubble divs. For the isMine case, use `text-blue-200` instead of `text-gray-500` for the italic placeholder.

**Step 2: Verify visually**

Run the dev server and check that:
- Text messages display normally
- Image messages show `[图片]` in italic gray
- Link/video messages show extracted title in italic gray
- Call messages show `[语音/视频通话]` in italic gray
- Recall messages show `"xxx" 撤回了一条消息` in italic gray

**Step 3: Commit**

```bash
git add apps/web/src/components/chat/MessageItem.tsx
git commit -m "feat: render non-text messages with styled placeholders"
```

---

### Task 6: Run all tests and verify

**Step 1: Run all server tests**

Run: `cd apps/server && npx vitest run`
Expected: All tests PASS

**Step 2: Run full build**

Run: `pnpm build`
Expected: Build succeeds with no errors

**Step 3: Final commit (if any fixes needed)**

Only if test/build fixes were required.
