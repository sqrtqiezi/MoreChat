# Phase 4: Subtraction Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy "WeChat Web Client" features (emoji download, optimistic updates) to focus on knowledge base core capabilities.

**Architecture:** Three-phase cleanup - backend services first, then frontend components, finally database schema. Each phase maintains system stability with full test coverage.

**Tech Stack:** TypeScript, Prisma, React, TanStack Query, Vitest

---

## File Structure Overview

### Files to Delete

**Backend:**
- `apps/server/src/services/emojiService.ts`
- `apps/server/src/services/emojiService.test.ts`
- `apps/server/src/services/emojiDownloadQueue.ts`
- `apps/server/src/services/emojiDownloadQueue.test.ts`

**Frontend:**
- `apps/web/src/components/EmojiMessage.tsx`
- `apps/web/src/utils/pendingMessages.ts` (if exists)

### Files to Modify

**Backend:**
- `apps/server/src/index.ts` - Remove emoji service initialization
- `apps/server/src/services/message.ts` - Remove emoji queue dependency
- `apps/server/src/routes/messages.ts` - Remove emoji endpoint
- `apps/server/src/routes/messages.test.ts` - Remove emoji tests
- `apps/server/prisma/schema.prisma` - Keep EmojiCache model (no migration)

**Frontend:**
- `apps/web/src/hooks/useSendMessage.ts` - Remove optimistic updates
- `apps/web/src/hooks/useSendImage.ts` - Remove optimistic updates
- `apps/web/src/hooks/useMessages.ts` - Remove pending message handling
- `apps/web/src/components/chat/MessageInput.tsx` - Simplify send logic

---

## Task 1: Delete Backend Emoji Services

**Files:**
- Delete: `apps/server/src/services/emojiService.ts`
- Delete: `apps/server/src/services/emojiService.test.ts`
- Delete: `apps/server/src/services/emojiDownloadQueue.ts`
- Delete: `apps/server/src/services/emojiDownloadQueue.test.ts`

- [ ] **Step 1: Verify files exist**

```bash
ls -la apps/server/src/services/emoji*.ts
```

Expected: List of 4 files (emojiService.ts, emojiService.test.ts, emojiDownloadQueue.ts, emojiDownloadQueue.test.ts)

- [ ] **Step 2: Delete emoji service files**

```bash
git rm apps/server/src/services/emojiService.ts
git rm apps/server/src/services/emojiService.test.ts
git rm apps/server/src/services/emojiDownloadQueue.ts
git rm apps/server/src/services/emojiDownloadQueue.test.ts
```

- [ ] **Step 3: Verify deletion**

```bash
git status
```

Expected: 4 files deleted

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(server): delete emoji service and download queue

Remove EmojiService and EmojiDownloadQueue as emoji download
is no longer a core feature for the knowledge base.

Part of Phase 4 subtraction execution."
```

---

## Task 2: Remove Emoji Dependencies from index.ts

**Files:**
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Read current index.ts structure**

```bash
grep -n "EmojiService\|emojiService\|EmojiDownloadQueue\|emojiQueue" apps/server/src/index.ts
```

Expected: Multiple lines showing emoji imports and initialization

- [ ] **Step 2: Remove emoji imports**

Remove these lines from `apps/server/src/index.ts`:

```typescript
import { EmojiService } from './services/emojiService.js'
import { EmojiDownloadQueue } from './services/emojiDownloadQueue.js'
```

- [ ] **Step 3: Remove emoji service initialization**

Remove these lines from `apps/server/src/index.ts` (around line 286-289):

```typescript
// 初始化 EmojiService
const emojiService = new EmojiService(databaseService, juhexbotAdapter, ossService)

// MessageService 需要 emojiQueue，使用 getter 延迟访问
let emojiQueue: EmojiDownloadQueue
```

- [ ] **Step 4: Remove emoji service from MessageService initialization**

Find the MessageService initialization (around line 298-299) and remove the emojiService parameter and emoji queue getter:

```typescript
// Remove:
emojiService,
{ enqueue: (msgId: string, conversationId: string) => emojiQueue.enqueue(msgId, conversationId) } as any,
```

- [ ] **Step 5: Remove emoji service from WebSocketService initialization**

Find the WebSocketService initialization (around line 341) and remove the emojiService parameter:

```typescript
// Remove:
emojiService,
```

- [ ] **Step 6: Remove EmojiDownloadQueue initialization**

Remove this line (around line 372):

```typescript
emojiQueue = new EmojiDownloadQueue(emojiService, wsService)
```

- [ ] **Step 7: Verify TypeScript compilation**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: Compilation errors about missing emojiService parameters (we'll fix these in next tasks)

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "refactor(server): remove emoji service from dependency injection

Remove EmojiService and EmojiDownloadQueue initialization from index.ts.
This breaks MessageService and WebSocketService temporarily - will be
fixed in next commits.

Part of Phase 4 subtraction execution."
```

---

## Task 3: Remove Emoji Dependency from MessageService

**Files:**
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/services/message.test.ts`

- [ ] **Step 1: Read MessageService constructor**

```bash
grep -A 10 "constructor" apps/server/src/services/message.ts | head -15
```

Expected: Constructor with emojiService or emojiQueue parameter

- [ ] **Step 2: Remove emojiService/emojiQueue from constructor**

In `apps/server/src/services/message.ts`, find the constructor and remove the emoji-related parameter. The constructor should look like:

```typescript
constructor(
  private db: DatabaseService,
  private dataLake: DataLakeService,
  private juhexbotAdapter: JuhexbotAdapter,
  private wsService: WebSocketService
  // Remove: private emojiService: EmojiService or emojiQueue parameter
) {}
```

- [ ] **Step 3: Find and remove emoji download trigger logic**

Search for msgType 47 handling:

```bash
grep -n "msgType.*47\|type.*47" apps/server/src/services/message.ts
```

Remove any code that calls `emojiService` or `emojiQueue.enqueue()` for emoji messages.

- [ ] **Step 4: Update MessageService tests**

In `apps/server/src/services/message.test.ts`, remove emoji-related mocks:

```typescript
// Remove emoji service mock from test setup
const mockEmojiService = {
  // ...
}
```

- [ ] **Step 5: Run MessageService tests**

```bash
cd apps/server && npx vitest run src/services/message.test.ts
```

Expected: All tests pass

- [ ] **Step 6: Verify TypeScript compilation**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: No errors in message.ts

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/message.ts apps/server/src/services/message.test.ts
git commit -m "refactor(server): remove emoji dependency from MessageService

Remove emojiService/emojiQueue parameter from MessageService constructor
and remove msgType 47 emoji download trigger logic.

Part of Phase 4 subtraction execution."
```

---

## Task 4: Remove Emoji Endpoint from Messages Route

**Files:**
- Modify: `apps/server/src/routes/messages.ts`
- Modify: `apps/server/src/routes/messages.test.ts`

- [ ] **Step 1: Find emoji endpoint in messages route**

```bash
grep -n "emoji" apps/server/src/routes/messages.ts
```

Expected: Lines showing emoji import, dependency, and GET endpoint

- [ ] **Step 2: Remove EmojiService import**

Remove this line from `apps/server/src/routes/messages.ts`:

```typescript
import type { EmojiService } from '../services/emojiService.js'
```

- [ ] **Step 3: Remove emojiService from route dependencies**

Remove `emojiService: EmojiService` from the `MessageRouteDeps` interface:

```typescript
interface MessageRouteDeps {
  db: DatabaseService
  messageService: MessageService
  // Remove: emojiService: EmojiService
}
```

- [ ] **Step 4: Remove GET /emoji endpoint**

Remove the entire emoji endpoint handler (around line 95-113):

```typescript
// Remove:
router.get('/:msgId/emoji', async (c) => {
  // ... entire handler
})
```

- [ ] **Step 5: Remove emoji tests**

In `apps/server/src/routes/messages.test.ts`, remove tests for the emoji endpoint:

```bash
grep -n "emoji" apps/server/src/routes/messages.test.ts
```

Remove any test cases that test the `/emoji` endpoint.

- [ ] **Step 6: Run messages route tests**

```bash
cd apps/server && npx vitest run src/routes/messages.test.ts
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/messages.ts apps/server/src/routes/messages.test.ts
git commit -m "refactor(server): remove emoji endpoint from messages route

Remove GET /api/messages/:msgId/emoji endpoint and emojiService
dependency from messages route.

Part of Phase 4 subtraction execution."
```

---

## Task 5: Run Full Backend Test Suite

**Files:**
- Test: All backend tests

- [ ] **Step 1: Run all backend tests**

```bash
cd apps/server && npx vitest run
```

Expected: All tests pass (except possibly emoji-related tests if any remain)

- [ ] **Step 2: Check for remaining emoji references**

```bash
grep -r "emojiService\|EmojiService\|emojiQueue\|EmojiDownloadQueue" apps/server/src --include="*.ts" --exclude-dir=node_modules
```

Expected: No results (or only in comments/types that are safe to ignore)

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd apps/server && npx tsc --noEmit
```

Expected: No compilation errors

- [ ] **Step 4: Commit checkpoint**

```bash
git add -A
git commit -m "chore(server): backend emoji cleanup complete

All emoji-related services, routes, and dependencies removed.
Backend tests passing. Ready for frontend cleanup.

Part of Phase 4 subtraction execution."
```

---

## Task 6: Delete Frontend EmojiMessage Component

**Files:**
- Delete: `apps/web/src/components/EmojiMessage.tsx`

- [ ] **Step 1: Verify file exists**

```bash
ls -la apps/web/src/components/EmojiMessage.tsx
```

Expected: File exists

- [ ] **Step 2: Check for imports of EmojiMessage**

```bash
grep -r "EmojiMessage" apps/web/src --include="*.tsx" --include="*.ts" --exclude-dir=node_modules
```

Expected: List of files importing EmojiMessage (we'll handle these separately)

- [ ] **Step 3: Delete EmojiMessage component**

```bash
git rm apps/web/src/components/EmojiMessage.tsx
```

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(web): delete EmojiMessage component

Remove EmojiMessage component as emoji download feature is removed.
This will break imports - will be fixed in next commits.

Part of Phase 4 subtraction execution."
```

---

## Task 7: Remove Optimistic Updates from useSendMessage

**Files:**
- Modify: `apps/web/src/hooks/useSendMessage.ts`

- [ ] **Step 1: Read current useSendMessage implementation**

```bash
cat apps/web/src/hooks/useSendMessage.ts | head -50
```

Expected: Hook with optimistic message logic

- [ ] **Step 2: Remove pendingMessages import**

Remove this line:

```typescript
import { addPendingMsgId } from '../utils/pendingMessages';
```

- [ ] **Step 3: Simplify sendMessage mutation**

Replace the optimistic update logic with simple API call. The mutation should look like:

```typescript
const sendMessageMutation = useMutation({
  mutationFn: async (text: string) => {
    const response = await fetch(`/api/conversations/${conversationId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    });
    
    if (!response.ok) {
      throw new Error('Failed to send message');
    }
    
    return response.json();
  },
  onSuccess: () => {
    // Message will appear via WebSocket, no need to update cache
  }
});
```

- [ ] **Step 4: Remove addPendingMsgId call**

Remove any lines calling `addPendingMsgId()` (around line 88).

- [ ] **Step 5: Verify TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: Possible errors about pendingMessages utils (we'll handle this next)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useSendMessage.ts
git commit -m "refactor(web): remove optimistic updates from useSendMessage

Simplify message sending to wait for WebSocket push instead of
optimistic UI updates. Improves reliability at cost of slight delay.

Part of Phase 4 subtraction execution."
```

---

## Task 8: Remove Optimistic Updates from useSendImage

**Files:**
- Modify: `apps/web/src/hooks/useSendImage.ts`

- [ ] **Step 1: Read current useSendImage implementation**

```bash
grep -n "addPendingMsgId\|optimistic" apps/web/src/hooks/useSendImage.ts
```

Expected: Lines with pendingMessages import and usage

- [ ] **Step 2: Remove pendingMessages import**

Remove this line:

```typescript
import { addPendingMsgId } from '../utils/pendingMessages';
```

- [ ] **Step 3: Remove addPendingMsgId call**

Remove any calls to `addPendingMsgId()` in the mutation's onSuccess handler.

- [ ] **Step 4: Keep upload progress logic**

Ensure the upload progress display logic remains intact - we're only removing optimistic message creation, not progress indication.

- [ ] **Step 5: Verify TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: Possible errors about pendingMessages utils

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useSendImage.ts
git commit -m "refactor(web): remove optimistic updates from useSendImage

Remove optimistic message creation for image sends. Upload progress
display is preserved.

Part of Phase 4 subtraction execution."
```

---

## Task 9: Remove Pending Message Handling from useMessages

**Files:**
- Modify: `apps/web/src/hooks/useMessages.ts`

- [ ] **Step 1: Read current useMessages implementation**

```bash
grep -n "consumePendingMsgId\|pending" apps/web/src/hooks/useMessages.ts
```

Expected: Lines with pendingMessages import and deduplication logic

- [ ] **Step 2: Remove consumePendingMsgId import**

Remove this line:

```typescript
import { consumePendingMsgId } from '../utils/pendingMessages';
```

- [ ] **Step 3: Simplify message deduplication**

Remove the pending message deduplication logic (around line 100). The messages should be deduplicated by msgId only:

```typescript
// Simplified deduplication - just by msgId
const uniqueMessages = messages.filter((msg, index, self) =>
  index === self.findIndex((m) => m.msgId === msg.msgId)
);
```

- [ ] **Step 4: Remove consumePendingMsgId calls**

Remove any calls to `consumePendingMsgId()`.

- [ ] **Step 5: Verify TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: Possible errors about pendingMessages utils

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/hooks/useMessages.ts
git commit -m "refactor(web): remove pending message handling from useMessages

Simplify message deduplication to only check msgId, removing
pending message tracking logic.

Part of Phase 4 subtraction execution."
```

---

## Task 10: Delete pendingMessages Utility (if exists)

**Files:**
- Delete: `apps/web/src/utils/pendingMessages.ts` (if exists)

- [ ] **Step 1: Check if pendingMessages utility exists**

```bash
ls -la apps/web/src/utils/pendingMessages.ts
```

Expected: File exists or "No such file"

- [ ] **Step 2: If file exists, delete it**

```bash
git rm apps/web/src/utils/pendingMessages.ts
```

- [ ] **Step 3: Verify no remaining imports**

```bash
grep -r "pendingMessages" apps/web/src --include="*.ts" --include="*.tsx" --exclude-dir=node_modules
```

Expected: No results

- [ ] **Step 4: Commit (if file was deleted)**

```bash
git commit -m "refactor(web): delete pendingMessages utility

Remove pendingMessages utility as optimistic updates are no longer used.

Part of Phase 4 subtraction execution."
```

---

## Task 11: Simplify MessageInput Component

**Files:**
- Modify: `apps/web/src/components/chat/MessageInput.tsx`

- [ ] **Step 1: Read current MessageInput implementation**

```bash
grep -n "emoji\|Emoji\|optimistic" apps/web/src/components/chat/MessageInput.tsx
```

Expected: Lines with emoji or optimistic update references

- [ ] **Step 2: Remove emoji-related imports**

Remove any imports related to emoji picker or emoji components.

- [ ] **Step 3: Remove emoji picker state and UI**

Remove:
- `showEmojiPicker` state (if exists)
- Emoji picker button
- Emoji picker component rendering

- [ ] **Step 4: Simplify send handler**

The send handler should just call the mutation and show loading state:

```typescript
const handleSend = async () => {
  if (!text.trim()) return;
  
  await sendMessageMutation.mutateAsync(text);
  setText('');
};
```

- [ ] **Step 5: Add loading state to send button**

```typescript
<button 
  onClick={handleSend}
  disabled={sendMessageMutation.isPending || !text.trim()}
>
  {sendMessageMutation.isPending ? 'Sending...' : 'Send'}
</button>
```

- [ ] **Step 6: Keep ImageInput component**

Ensure ImageInput remains in the component - we're only removing emoji features, not image sending.

- [ ] **Step 7: Verify component renders**

```bash
cd apps/web && npm run dev
```

Open browser and verify MessageInput renders correctly.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/chat/MessageInput.tsx
git commit -m "refactor(web): simplify MessageInput component

Remove emoji picker and optimistic update logic from MessageInput.
Add loading state during message send. Keep ImageInput for image sending.

Part of Phase 4 subtraction execution."
```

---

## Task 12: Run Full Frontend Test Suite

**Files:**
- Test: All frontend tests

- [ ] **Step 1: Run all frontend tests**

```bash
cd apps/web && npm run test
```

Expected: All tests pass (or only emoji-related tests fail if any remain)

- [ ] **Step 2: Check for remaining emoji references**

```bash
grep -r "emoji\|Emoji\|optimistic\|pending" apps/web/src --include="*.ts" --include="*.tsx" --exclude-dir=node_modules | grep -v "wechatEmoji\|WechatEmoji"
```

Expected: Minimal results (only legitimate uses like wechatEmoji.ts for text emoji rendering)

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No compilation errors

- [ ] **Step 4: Commit checkpoint**

```bash
git add -A
git commit -m "chore(web): frontend emoji and optimistic update cleanup complete

All emoji components and optimistic update logic removed.
Frontend tests passing. Ready for final verification.

Part of Phase 4 subtraction execution."
```

---

## Task 13: Update Prisma Schema (Documentation Only)

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (comment only)

- [ ] **Step 1: Add deprecation comment to EmojiCache model**

Add a comment above the `EmojiCache` model in `apps/server/prisma/schema.prisma`:

```prisma
// DEPRECATED (2026-04-30): This table is no longer used after Phase 4 subtraction.
// The table is kept for historical data but no code reads or writes to it.
// Safe to drop in a future version after data archival if needed.
model EmojiCache {
  // ... existing fields
}
```

- [ ] **Step 2: Verify no code references EmojiCache**

```bash
grep -r "EmojiCache" apps/server/src --include="*.ts" --exclude-dir=node_modules
```

Expected: No results (only in schema.prisma)

- [ ] **Step 3: Do NOT create migration**

Do not run `npx prisma migrate dev`. The table stays in the database.

- [ ] **Step 4: Regenerate Prisma Client**

```bash
cd apps/server && npx prisma generate
```

Expected: Prisma Client regenerated successfully

- [ ] **Step 5: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "docs(server): mark EmojiCache model as deprecated

Add deprecation comment to EmojiCache model. Table is kept in database
for historical data but no longer used by application code.

Part of Phase 4 subtraction execution."
```

---

## Task 14: Final Integration Testing

**Files:**
- Test: Full application

- [ ] **Step 1: Run all backend tests**

```bash
cd apps/server && npx vitest run
```

Expected: All tests pass

- [ ] **Step 2: Run all frontend tests**

```bash
cd apps/web && npm run test
```

Expected: All tests pass

- [ ] **Step 3: Start development servers**

```bash
pnpm dev
```

Expected: Both frontend and backend start without errors

- [ ] **Step 4: Manual testing - Send text message**

1. Open browser to http://localhost:3000
2. Navigate to a conversation
3. Type a text message and send
4. Verify: Message appears after ~500ms (via WebSocket)
5. Verify: Send button is disabled during send
6. Verify: No "ghost messages" or optimistic updates

- [ ] **Step 5: Manual testing - Send image message**

1. Click image upload button
2. Select an image
3. Verify: Upload progress shows
4. Verify: Image message appears after upload completes
5. Verify: No errors in console

- [ ] **Step 6: Manual testing - View historical emoji messages**

1. Find a conversation with historical emoji messages (msgType 47)
2. Verify: Emoji messages display as placeholder or text
3. Verify: No errors or crashes

- [ ] **Step 7: Check browser console for errors**

Expected: No errors related to emoji or optimistic updates

- [ ] **Step 8: Commit final checkpoint**

```bash
git add -A
git commit -m "test: Phase 4 subtraction execution complete

All emoji services and optimistic updates removed.
- Backend: EmojiService, EmojiDownloadQueue deleted
- Frontend: EmojiMessage, optimistic updates removed
- Database: EmojiCache model marked deprecated (table kept)
- Tests: All passing
- Manual testing: Text and image sending working

Part of Phase 4 subtraction execution."
```

---

## Self-Review Checklist

### Spec Coverage

- [x] Backend emoji services deleted (Task 1)
- [x] Emoji dependencies removed from index.ts (Task 2)
- [x] MessageService simplified (Task 3)
- [x] Emoji endpoint removed from routes (Task 4)
- [x] Frontend EmojiMessage deleted (Task 6)
- [x] Optimistic updates removed from useSendMessage (Task 7)
- [x] Optimistic updates removed from useSendImage (Task 8)
- [x] Pending message handling removed from useMessages (Task 9)
- [x] MessageInput simplified (Task 11)
- [x] Prisma schema documented (Task 13)
- [x] Full integration testing (Task 14)

### Placeholder Scan

- [x] No TBD, TODO, or FIXME in plan
- [x] All code blocks are complete
- [x] All file paths are exact
- [x] All commands have expected output

### Type Consistency

- [x] No references to deleted types (EmojiService, EmojiDownloadQueue, OptimisticMessage)
- [x] Consistent removal of emoji-related parameters across all services
- [x] WebSocket event types consistent (message:new, highlight:new, message:recall)

---

## Execution Notes

**Estimated Time:** 2-3 hours for full implementation and testing

**Critical Path:**
1. Backend cleanup must complete before frontend (Tasks 1-5)
2. Frontend hooks must be updated before components (Tasks 7-9 before 11)
3. Integration testing only after all code changes (Task 14)

**Rollback Strategy:**
- Each task is a separate commit
- Can rollback to any checkpoint
- Database table is never dropped, so data is safe

**Known Issues:**
- Historical emoji messages (msgType 47) will display as placeholders
- Message send has ~500ms delay waiting for WebSocket (acceptable for knowledge base use case)
- No migration created for EmojiCache - table remains in database
