# Message Display Fix Design

## Problem

Frontend renders raw XML content for non-text messages (image, app/link, call, recall) because it ignores `msgType` and treats all `content` as plain text.

## Approach

Backend pre-processes message content in `conversationService.getMessages()`, returning `displayType` and `displayContent` fields alongside the raw data. This positions the backend as the central place for future rich media processing (e.g., image CDN download/upload).

## API Response Changes

Each message gains two new fields:

```typescript
{
  // existing fields...
  displayType: 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'unknown',
  displayContent: string,  // human-readable summary
}
```

## Processing Rules

| msgType | displayType | displayContent |
|---------|-------------|----------------|
| 1 | `text` | Raw content unchanged |
| 3 | `image` | `[图片]` |
| 49 | `link` or `video` | Extract `<title>` from appmsg; for finderFeed extract nickname + desc |
| 51 | `call` | `[语音/视频通话]` |
| 10002 | `recall` | Extract `<replacemsg>` CDATA |
| other | `unknown` | `[不支持的消息类型]` |

## File Changes

1. **`apps/server/src/services/conversationService.ts`** — Add `processMessageContent()` with XML parsing per type
2. **`apps/web/src/api/chat.ts`** — Add `displayType`/`displayContent` to `ApiMessage`, use `displayContent` in `mapMessage()`
3. **`apps/web/src/types/index.ts`** — Add `msgType` and `displayType` to `Message` interface
4. **`apps/web/src/components/chat/MessageItem.tsx`** — Style non-text messages differently (gray italic for placeholders)

## Future Extension

The backend processing layer is designed to be extended for:
- Image: download via third-party service, upload to CDN, return image URL
- Video: thumbnail extraction, CDN hosting
- File: download link generation
