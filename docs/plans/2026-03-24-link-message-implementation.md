# 链接消息图文卡片实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将微信链接/图文消息（appmsg type=5）渲染为可点击的简洁卡片，点击在新标签页打开链接。

**Architecture:** 后端扩展 type=5 的 displayContent 为 JSON（含 title/url/des），前端新建 LinkMessage 组件渲染卡片。

**Tech Stack:** Vitest (后端测试), React + Tailwind (前端组件)

---

### Task 1: 后端 — 修改 type=5 的 displayContent 为 JSON

**Files:**
- Modify: `apps/server/src/services/messageContentProcessor.ts:160-165`
- Modify: `apps/server/src/services/messageContentProcessor.test.ts:45-73`

**Step 1: 更新测试用例**

修改 `messageContentProcessor.test.ts` 中 type=5 相关的两个测试：

测试 1 — "should extract title from appmsg"（第 46-50 行）：
```typescript
it('should extract link info as JSON from appmsg type 5', () => {
  const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title>测试链接标题</title>\n\t\t<type>5</type>\n\t\t<url>https://example.com</url>\n\t\t<des>这是描述</des>\n\t</appmsg>\n</msg>'
  const result = processMessageContent(49, xmlContent)
  expect(result.displayType).toBe('link')
  const parsed = JSON.parse(result.displayContent)
  expect(parsed.title).toBe('测试链接标题')
  expect(parsed.url).toBe('https://example.com')
  expect(parsed.des).toBe('这是描述')
})
```

测试 2 — "should return [链接] when title is empty"（第 69-73 行）：
```typescript
it('should return JSON with fallback title when title is empty', () => {
  const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title></title>\n\t\t<type>5</type>\n\t</appmsg>\n</msg>'
  const result = processMessageContent(49, xmlContent)
  expect(result.displayType).toBe('link')
  const parsed = JSON.parse(result.displayContent)
  expect(parsed.title).toBe('[链接]')
  expect(parsed.url).toBe('')
})
```

新增测试 — 无 url 字段时：
```typescript
it('should handle link message without url field', () => {
  const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title>只有标题</title>\n\t\t<type>5</type>\n\t</appmsg>\n</msg>'
  const result = processMessageContent(49, xmlContent)
  expect(result.displayType).toBe('link')
  const parsed = JSON.parse(result.displayContent)
  expect(parsed.title).toBe('只有标题')
  expect(parsed.url).toBe('')
  expect(parsed.des).toBe('')
})
```

**Step 2: 运行测试验证失败**

Run: `cd apps/server && npx vitest run src/services/messageContentProcessor.test.ts`
Expected: 3 个 link 相关测试 FAIL

**Step 3: 修改实现**

在 `messageContentProcessor.ts` 第 160-165 行，替换 default 分支：

```typescript
// Default: use title (type 5 = link/article)
const title = appmsg.title ? String(appmsg.title).trim() : ''
const url = appmsg.url ? String(appmsg.url).trim() : ''
const des = appmsg.des ? String(appmsg.des).trim() : ''
return {
  displayType: 'link',
  displayContent: JSON.stringify({ title: title || '[链接]', url, des }),
}
```

同时需要更新 type=57 fallback 分支（第 119-124 行），保持一致：

```typescript
// Fallback to link if no refermsg
const title = appmsg.title ? String(appmsg.title).trim() : ''
const url = appmsg.url ? String(appmsg.url).trim() : ''
const des = appmsg.des ? String(appmsg.des).trim() : ''
return {
  displayType: 'link',
  displayContent: JSON.stringify({ title: title || '[链接]', url, des }),
}
```

还需要更新测试 "should fallback to link when type=57 but no refermsg"（第 333-346 行）：
```typescript
it('should fallback to link when type=57 but no refermsg', () => {
  const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>普通标题</title>
    <type>57</type>
  </appmsg>
</msg>`
  const result = processMessageContent(49, xmlContent)
  expect(result.displayType).toBe('link')
  const parsed = JSON.parse(result.displayContent)
  expect(parsed.title).toBe('普通标题')
})
```

还需要更新 "should handle file message without cdnattachurl gracefully"（第 567-582 行），因为它也 fall through 到 link：
```typescript
it('should handle file message without cdnattachurl gracefully', () => {
  const noCdnXml = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>test.pdf</title>
    <type>6</type>
    <appattach>
      <totallen>100</totallen>
      <fileext>pdf</fileext>
    </appattach>
  </appmsg>
</msg>`
  const result = processMessageContent(49, noCdnXml)
  expect(result.displayType).toBe('link')
  const parsed = JSON.parse(result.displayContent)
  expect(parsed.title).toBe('test.pdf')
})
```

**Step 4: 运行测试验证通过**

Run: `cd apps/server && npx vitest run src/services/messageContentProcessor.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add apps/server/src/services/messageContentProcessor.ts apps/server/src/services/messageContentProcessor.test.ts
git commit -m "feat(link): extract title/url/des as JSON for appmsg type 5"
```

---

### Task 2: 前端 — 创建 LinkMessage 组件

**Files:**
- Create: `apps/web/src/components/chat/LinkMessage.tsx`

**Step 1: 创建组件**

```tsx
interface LinkInfo {
  title: string
  url: string
  des: string
}

interface LinkMessageProps {
  displayContent: string
}

function parseLinkContent(displayContent: string): LinkInfo {
  try {
    const parsed = JSON.parse(displayContent)
    return {
      title: parsed.title || '[链接]',
      url: parsed.url || '',
      des: parsed.des || '',
    }
  } catch {
    // Fallback for old data: plain text title, no url
    return { title: displayContent || '[链接]', url: '', des: '' }
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function LinkMessage({ displayContent }: LinkMessageProps) {
  const { title, url, des } = parseLinkContent(displayContent)
  const domain = extractDomain(url)

  const handleClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const content = (
    <div className={`border border-gray-200 rounded-lg p-3 max-w-xs bg-white ${url ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}
      onClick={url ? handleClick : undefined}
      role={url ? 'link' : undefined}
    >
      <p className="text-sm font-medium text-gray-900 line-clamp-2">{title}</p>
      {domain && (
        <p className="text-xs text-gray-400 mt-1">{domain}</p>
      )}
    </div>
  )

  return content
}
```

**Step 2: 类型检查**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -10`

**Step 3: Commit**

```bash
git add apps/web/src/components/chat/LinkMessage.tsx
git commit -m "feat(link): add LinkMessage card component"
```

---

### Task 3: 前端 — 集成到 MessageItem

**Files:**
- Modify: `apps/web/src/components/chat/MessageItem.tsx`

**Step 1: 添加 link 分支**

在 `MessageItem.tsx` 中：

1. 导入 LinkMessage：
```typescript
import { LinkMessage } from './LinkMessage';
```

2. 在 `renderContent()` 中，在 `displayType === 'file'` 分支之后（第 220 行后），添加：
```typescript
if (displayType === 'link') {
  return <LinkMessage displayContent={content} />;
}
```

**Step 2: 类型检查**

Run: `cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -10`

**Step 3: Commit**

```bash
git add apps/web/src/components/chat/MessageItem.tsx
git commit -m "feat(link): integrate LinkMessage into MessageItem

Closes #9"
```

---

### Task 4: 最终验证

**Step 1: 后端测试**

Run: `cd apps/server && npx vitest run`

**Step 2: 类型检查**

Run: `pnpm type-check`

**Step 3: Lint**

Run: `pnpm lint`

**Step 4: 构建**

Run: `pnpm build`
