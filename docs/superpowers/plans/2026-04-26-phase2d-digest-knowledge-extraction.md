# Phase 2D Digest And Knowledge Extraction Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade MoreChat's existing digest feature into a production-ready knowledge pipeline that supports automatic important-message digests, manual range digests, and structured knowledge-card extraction.

**Architecture:** Keep `DigestEntry` as the window-summary layer, add `KnowledgeCard` as the structured knowledge layer, and introduce a thin `DigestWorkflowService` so queue-triggered and API-triggered flows share the same orchestration. Split message-window assembly out of `DigestService` into `DigestWindowService`, keep digest generation and persistence in `DigestService`, and keep structured extraction in `KnowledgeExtractionService`.

**Tech Stack:** Prisma + SQLite + Hono + Vitest + existing `LlmClient` + existing `KnowledgeQueue` + DataLake/MessageIndex services

---

## Spec Reference

- `docs/superpowers/specs/2026-04-26-phase2d-digest-knowledge-extraction-design.md`

## Scope Decision

This plan stays within a single subsystem: backend digest and knowledge extraction. It does not include UI, topic clustering, retry infrastructure, or version-history support.

## File Structure

### Modify

- `apps/server/prisma/schema.prisma`
  Add formal digest metadata fields and the new `KnowledgeCard` model.
- `apps/server/prisma/migrations/<timestamp>_phase2d_digest_knowledge_cards/migration.sql`
  Persist schema changes for existing environments.
- `apps/server/src/services/database.ts`
  Keep test-environment schema bootstrap aligned with new Prisma models.
- `apps/server/src/services/digestService.ts`
  Refactor from create-only digesting into status-aware upsert-based digest persistence.
- `apps/server/src/services/digestService.test.ts`
  Update existing tests to assert `DigestEntry` upsert, status transitions, and workflow-facing return shape.
- `apps/server/src/services/message.ts`
  Keep automatic digest enqueueing aligned with the workflow contract.
- `apps/server/src/services/knowledgeQueue.ts`
  Tighten task payload typing for digest workflow tasks if needed.
- `apps/server/src/services/knowledgeQueue.test.ts`
  Cover the digest workflow task payload shape.
- `apps/server/src/index.ts`
  Wire `DigestWindowService`, `DigestService`, `KnowledgeExtractionService`, and `DigestWorkflowService`; register queue handlers through the workflow service.
- `apps/server/src/routes/digest.ts`
  Route manual digest requests through the workflow service while preserving the v1 HTTP response shape.
- `apps/server/src/routes/digest.test.ts`
  Update mocks and assertions for workflow-based routing.

### Create

- `apps/server/src/services/digestWindowService.ts`
  Build stable digest input windows from `MessageIndex` + `DataLake`.
- `apps/server/src/services/digestWindowService.test.ts`
  Unit tests for window assembly, filtering, placeholders, and truncation.
- `apps/server/src/services/knowledgeExtractionService.ts`
  Extract `title`, `summary`, `decisions`, `actionItems`, `risks`, `participants`, and `timeAnchors` from a digest summary.
- `apps/server/src/services/knowledgeExtractionService.test.ts`
  Unit tests for structured extraction, empty-field handling, and upsert behavior.
- `apps/server/src/services/digestWorkflowService.ts`
  Shared orchestration for manual and automatic digest flows.
- `apps/server/src/services/digestWorkflowService.test.ts`
  Unit tests for digest-plus-extraction orchestration and failure-isolation behavior.

## Chunk 1: Persistence And Window Assembly

### Task 1: Extend Prisma Models For Phase 2D

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Modify: `apps/server/src/services/database.ts`
- Create: `apps/server/prisma/migrations/<timestamp>_phase2d_digest_knowledge_cards/migration.sql`

- [ ] **Step 1: Add a failing schema bootstrap test in `digestWorkflowService.test.ts`**

Use an integration-style setup that creates a test `DatabaseService`, inserts a `DigestEntry`, then attempts to upsert a `KnowledgeCard`.

```typescript
it('persists phase 2d digest metadata and knowledge cards', async () => {
  const db = new DatabaseService(testDbUrl)
  await db.connect()

  const digest = await db.prisma.digestEntry.create({
    data: {
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
      summary: 'summary',
      messageCount: 3,
      sourceKind: 'manual',
      status: 'ready',
    },
  })

  const card = await db.prisma.knowledgeCard.create({
    data: {
      digestEntryId: digest.id,
      conversationId: 'conv_1',
      title: '预算讨论',
      summary: '讨论预算与上线安排',
      decisions: '[]',
      actionItems: '[]',
      risks: '[]',
      participants: '[]',
      timeAnchors: '[]',
    },
  })

  expect(card.digestEntryId).toBe(digest.id)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/digestWorkflowService.test.ts`

Expected: FAIL because `KnowledgeCard` and new `DigestEntry` fields do not exist.

- [ ] **Step 3: Update `schema.prisma`**

Extend `DigestEntry`:

```prisma
model DigestEntry {
  id             String   @id @default(cuid())
  conversationId String
  startTime      Int
  endTime        Int
  summary        String
  messageCount   Int
  sourceKind     String
  triggerMsgId   String?
  status         String
  errorMessage   String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  knowledgeCard KnowledgeCard?

  @@index([conversationId])
  @@index([startTime])
  @@unique([conversationId, startTime, endTime, sourceKind])
}
```

Add `KnowledgeCard`:

```prisma
model KnowledgeCard {
  id           String   @id @default(cuid())
  digestEntryId String  @unique
  conversationId String
  title        String
  summary      String
  decisions    String
  actionItems  String
  risks        String
  participants String
  timeAnchors  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  digestEntry  DigestEntry @relation(fields: [digestEntryId], references: [id], onDelete: Cascade)

  @@index([conversationId])
}
```

- [ ] **Step 4: Add the migration SQL**

Create a migration that:

- adds `sourceKind`, `triggerMsgId`, `status`, `errorMessage`, and `updatedAt` to `DigestEntry`
- backfills existing rows with `sourceKind='manual'`, `status='ready'`, `updatedAt=createdAt`
- creates `KnowledgeCard`
- creates the unique constraint on `(conversationId, startTime, endTime, sourceKind)`

- [ ] **Step 5: Align `database.ts` test bootstrap**

Update `pushSchema()` so test databases create the same columns and table definitions as Prisma migrations:

```typescript
await this.prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "DigestEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "sourceKind" TEXT NOT NULL DEFAULT 'manual',
    "triggerMsgId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )
`)
```

Also add `ALTER TABLE` guards for legacy test DBs and create the `KnowledgeCard` table.

- [ ] **Step 6: Regenerate Prisma client and run the test again**

Run:

```bash
cd /Users/niujin/develop/MoreChat/apps/server
npx prisma generate
npx vitest run src/services/digestWorkflowService.test.ts
```

Expected: FAIL later in service wiring, but no longer because the schema is missing.

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations apps/server/src/services/database.ts
git commit -m "feat(knowledge): add phase 2d digest and knowledge card models"
```

### Task 2: Create DigestWindowService

**Files:**
- Create: `apps/server/src/services/digestWindowService.ts`
- Create: `apps/server/src/services/digestWindowService.test.ts`

- [ ] **Step 1: Write failing tests for window assembly**

```typescript
describe('DigestWindowService', () => {
  it('builds an ordered digest window from MessageIndex and DataLake', async () => {
    const service = new DigestWindowService(mockDb, mockDataLake, {
      maxMessages: 3,
      perMessageMaxChars: 10,
    })

    mockDb.prisma.messageIndex.findMany.mockResolvedValue([
      makeMessageIndex('m1', 100, 1),
      makeMessageIndex('m2', 110, 3),
      makeMessageIndex('m3', 120, 1),
    ])
    mockDataLake.getMessage.mockImplementation(async (key: string) => {
      if (key === 'key_m1') return makeChatMessage('m1', '这是第一条很长很长的文本消息', 100, 1)
      if (key === 'key_m3') return makeChatMessage('m3', '第三条消息', 120, 1)
      return makeChatMessage('m2', '<xml/>', 110, 3)
    })

    const window = await service.buildWindow({
      conversationId: 'conv_1',
      startTime: 90,
      endTime: 130,
    })

    expect(window.messageCount).toBe(3)
    expect(window.lines).toEqual([
      'alice: 这是第一条很长很长的…',
      'alice: [图片]',
      'alice: 第三条消息',
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/digestWindowService.test.ts`

Expected: FAIL because `DigestWindowService` does not exist.

- [ ] **Step 3: Implement `DigestWindowService`**

Provide a focused API:

```typescript
export interface DigestWindowInput {
  conversationId: string
  startTime: number
  endTime: number
}

export interface DigestWindow {
  conversationId: string
  startTime: number
  endTime: number
  messageCount: number
  lines: string[]
}

export class DigestWindowService {
  async buildWindow(input: DigestWindowInput): Promise<DigestWindow> {
    // load indexes, render text, trim to limits, return ordered lines
  }
}
```

Move message rendering and placeholder logic out of `DigestService` into this file.

- [ ] **Step 4: Add edge-case tests**

Add tests for:

- recalled messages excluded
- missing DataLake records skipped
- empty text skipped
- `chatroomSender` overrides `fromUsername`
- `DigestRangeTooSmallError` remains the responsibility of `DigestService`, not this service

- [ ] **Step 5: Run the service tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/digestWindowService.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/digestWindowService.ts apps/server/src/services/digestWindowService.test.ts
git commit -m "feat(digest): add digest window assembly service"
```

## Chunk 2: Digest Persistence And Workflow Core

### Task 3: Refactor DigestService To Status-Aware Upsert Semantics

**Files:**
- Modify: `apps/server/src/services/digestService.ts`
- Modify: `apps/server/src/services/digestService.test.ts`

- [ ] **Step 1: Rewrite the digest tests first**

Change the unit tests so they assert:

- `generateForRange()` writes `sourceKind`, `status`, `updatedAt`
- repeated generation for the same `(conversationId, startTime, endTime, sourceKind)` updates the existing row
- digest failures persist `status='failed'` and `errorMessage`

Example expectation:

```typescript
expect(mockDb.prisma.digestEntry.upsert).toHaveBeenCalledWith({
  where: {
    conversationId_startTime_endTime_sourceKind: {
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 120,
      sourceKind: 'manual',
    },
  },
  create: expect.objectContaining({
    status: 'ready',
    sourceKind: 'manual',
  }),
  update: expect.objectContaining({
    summary: '讨论了项目预算。',
    status: 'ready',
  }),
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/digestService.test.ts`

Expected: FAIL because the service still uses `create()` / `findFirst()` and has no status-aware upsert behavior.

- [ ] **Step 3: Refactor `DigestService`**

Refine the public API:

```typescript
export interface GenerateRangeInput {
  conversationId: string
  startTime: number
  endTime: number
  sourceKind?: 'auto' | 'manual'
  triggerMsgId?: string
}

export class DigestService {
  constructor(
    private readonly digestWindowService: DigestWindowService,
    private readonly db: DatabaseService,
    private readonly llm: LlmClient,
    options: DigestServiceOptions = {}
  ) {}
}
```

Implementation requirements:

- call `DigestWindowService.buildWindow()`
- throw `DigestRangeTooSmallError` if `window.messageCount < minMessages`
- call `llm.chat()`
- `upsert` the `DigestEntry` using the unique window key
- on LLM failure, upsert a failed record for the requested window, then rethrow

- [ ] **Step 4: Keep `generateForImportantMessage()` as a thin helper**

It should:

- look up the anchor `MessageIndex`
- compute the auto window
- call `generateForRange()` with `sourceKind: 'auto'` and `triggerMsgId`

Remove the old `findFirst()` duplicate-window shortcut; the unique-key upsert now owns deduplication.

- [ ] **Step 5: Run the tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/digestService.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/digestService.ts apps/server/src/services/digestService.test.ts
git commit -m "feat(digest): make digest persistence status-aware and idempotent"
```

### Task 4: Add KnowledgeExtractionService

**Files:**
- Create: `apps/server/src/services/knowledgeExtractionService.ts`
- Create: `apps/server/src/services/knowledgeExtractionService.test.ts`

- [ ] **Step 1: Write failing tests for extraction and upsert**

```typescript
describe('KnowledgeExtractionService', () => {
  it('extracts structured fields from a digest and upserts a knowledge card', async () => {
    mockLlm.chat.mockResolvedValue(JSON.stringify({
      title: '预算与上线讨论',
      summary: '讨论预算审批与周五上线',
      decisions: ['本周五上线'],
      actionItems: ['Alice 提交预算表'],
      risks: ['预算未审批'],
      participants: ['Alice', 'Bob'],
      timeAnchors: ['本周五'],
    }))

    const result = await service.extractFromDigest({
      id: 'digest_1',
      conversationId: 'conv_1',
      summary: '讨论预算审批与上线安排',
    } as DigestRecord)

    expect(mockDb.prisma.knowledgeCard.upsert).toHaveBeenCalled()
    expect(result.title).toBe('预算与上线讨论')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/knowledgeExtractionService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement `KnowledgeExtractionService`**

Suggested shape:

```typescript
export interface KnowledgeCardRecord {
  id: string
  digestEntryId: string
  conversationId: string
  title: string
  summary: string
  decisions: string
  actionItems: string
  risks: string
  participants: string
  timeAnchors: string
  createdAt: Date
  updatedAt: Date
}

export class KnowledgeExtractionService {
  async extractFromDigest(digest: DigestRecord): Promise<KnowledgeCardRecord> {
    // call llm.chat(), parse JSON safely, upsert KnowledgeCard
  }
}
```

Implementation rules:

- use a strict JSON-only system prompt
- parse LLM output with runtime validation
- default missing arrays to `[]`
- store arrays with `JSON.stringify(...)`
- if parsing fails, throw and let the workflow isolate the failure

- [ ] **Step 4: Add edge-case tests**

Add tests for:

- malformed JSON response
- empty optional arrays
- repeated extraction for the same `digestEntryId` updates the card

- [ ] **Step 5: Run the extraction tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/knowledgeExtractionService.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/knowledgeExtractionService.ts apps/server/src/services/knowledgeExtractionService.test.ts
git commit -m "feat(knowledge): add structured extraction from digests"
```

## Chunk 3: Shared Orchestration And Integration

### Task 5: Add DigestWorkflowService For Shared Automatic And Manual Flows

**Files:**
- Create: `apps/server/src/services/digestWorkflowService.ts`
- Create: `apps/server/src/services/digestWorkflowService.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

```typescript
describe('DigestWorkflowService', () => {
  it('runs digest generation and knowledge extraction for manual ranges', async () => {
    mockDigestService.generateForRange.mockResolvedValue(digestRecord)
    mockKnowledgeExtractionService.extractFromDigest.mockResolvedValue(knowledgeCard)

    const result = await service.generateManualDigest({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
    })

    expect(mockDigestService.generateForRange).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
      sourceKind: 'manual',
    })
    expect(mockKnowledgeExtractionService.extractFromDigest).toHaveBeenCalledWith(digestRecord)
    expect(result.digest).toEqual(digestRecord)
    expect(result.knowledgeCard).toEqual(knowledgeCard)
  })

  it('keeps digest success when extraction fails', async () => {
    mockDigestService.generateForRange.mockResolvedValue(digestRecord)
    mockKnowledgeExtractionService.extractFromDigest.mockRejectedValue(new Error('bad json'))

    const result = await service.generateManualDigest({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
    })

    expect(result.digest).toEqual(digestRecord)
    expect(result.knowledgeCard).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/digestWorkflowService.test.ts`

Expected: FAIL because the workflow service does not exist.

- [ ] **Step 3: Implement the workflow service**

Use a narrow orchestrator:

```typescript
export class DigestWorkflowService {
  async generateManualDigest(input: GenerateRangeInput): Promise<{
    digest: DigestRecord
    knowledgeCard: KnowledgeCardRecord | null
  }> {}

  async generateAutomaticDigest(msgId: string): Promise<{
    digest: DigestRecord | null
    knowledgeCard: KnowledgeCardRecord | null
  }> {}
}
```

Rules:

- manual flow always uses `sourceKind: 'manual'`
- automatic flow uses `DigestService.generateForImportantMessage()`
- extraction failure logs and returns `knowledgeCard: null`
- digest failure is rethrown for manual API and swallowed/logged by queue handler

- [ ] **Step 4: Run the workflow tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/digestWorkflowService.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/digestWorkflowService.ts apps/server/src/services/digestWorkflowService.test.ts
git commit -m "feat(digest): add shared digest workflow service"
```

### Task 6: Wire Queue, HTTP Route, And App Initialization Through The Workflow

**Files:**
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/routes/digest.ts`
- Modify: `apps/server/src/routes/digest.test.ts`
- Modify: `apps/server/src/services/message.ts`
- Modify: `apps/server/src/services/knowledgeQueue.ts`
- Modify: `apps/server/src/services/knowledgeQueue.test.ts`

- [ ] **Step 1: Update the route tests first**

Keep the phase-2D v1 HTTP response shape backward-compatible:

```typescript
mockWorkflow.generateManualDigest.mockResolvedValue({
  digest: {
    id: 'digest_1',
    conversationId: 'conv_1',
    startTime: 100,
    endTime: 200,
    summary: '摘要内容',
    messageCount: 3,
    createdAt: new Date(),
  },
  knowledgeCard: null,
})

const res = await app.request('/api/digest', { method: 'POST', body: JSON.stringify(body) })
const payload = await res.json()

expect(payload.success).toBe(true)
expect(payload.data.id).toBe('digest_1')
```

The route still returns the `digest` object as `data`; it simply ensures extraction runs behind the scenes.

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/digest.test.ts`

Expected: FAIL because the route still depends directly on `DigestService`.

- [ ] **Step 3: Update `digest.ts`**

Change the dependency to:

```typescript
interface DigestRouteDeps {
  digestWorkflowService?: DigestWorkflowService
}
```

Then call:

```typescript
const result = await deps.digestWorkflowService.generateManualDigest(parsed.data)
return c.json({ success: true, data: result.digest })
```

- [ ] **Step 4: Update `index.ts`**

Wire services in this order:

1. `DigestWindowService`
2. `DigestService`
3. `KnowledgeExtractionService`
4. `DigestWorkflowService`

Register the queue handler through the workflow:

```typescript
knowledgeQueue.registerHandler('digest-generation', async (task) => {
  try {
    const result = await digestWorkflowService.generateAutomaticDigest(task.msgId)
    if (result.digest) {
      logger.info({ msgId: task.msgId, digestId: result.digest.id }, 'Generated digest')
    }
  } catch (error) {
    logger.warn({ err: error, msgId: task.msgId }, 'Failed to process digest task')
  }
})
```

- [ ] **Step 5: Keep `message.ts` minimal**

Do not add extra business rules. Preserve:

- rule-hit-important enqueue
- semantic-important enqueue

Only update payload typing if `KnowledgeTask` narrows `data`.

- [ ] **Step 6: Extend `knowledgeQueue.ts` typing only if needed**

If you tighten task typing, keep it local and pragmatic:

```typescript
export type KnowledgeTask =
  | { type: 'digest-generation'; msgId: string; data: {} }
  | { type: 'semantic-importance'; msgId: string; data: { content: string } }
  | { type: 'entity-extraction'; msgId: string; data: { content: string } }
```

Then update `knowledgeQueue.test.ts` to cover the digest task shape.

- [ ] **Step 7: Run integration-facing tests**

Run:

```bash
cd /Users/niujin/develop/MoreChat/apps/server
npx vitest run src/routes/digest.test.ts
npx vitest run src/services/knowledgeQueue.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/index.ts apps/server/src/routes/digest.ts apps/server/src/routes/digest.test.ts apps/server/src/services/message.ts apps/server/src/services/knowledgeQueue.ts apps/server/src/services/knowledgeQueue.test.ts
git commit -m "feat(digest): wire automatic and manual digests through shared workflow"
```

## Chunk 4: Final Verification

### Task 7: Run Focused Regression Coverage

**Files:**
- Test: `apps/server/src/services/digestWindowService.test.ts`
- Test: `apps/server/src/services/digestService.test.ts`
- Test: `apps/server/src/services/knowledgeExtractionService.test.ts`
- Test: `apps/server/src/services/digestWorkflowService.test.ts`
- Test: `apps/server/src/routes/digest.test.ts`
- Test: `apps/server/src/services/knowledgeQueue.test.ts`

- [ ] **Step 1: Run the focused test suite**

```bash
cd /Users/niujin/develop/MoreChat/apps/server
npx vitest run src/services/digestWindowService.test.ts
npx vitest run src/services/digestService.test.ts
npx vitest run src/services/knowledgeExtractionService.test.ts
npx vitest run src/services/digestWorkflowService.test.ts
npx vitest run src/routes/digest.test.ts
npx vitest run src/services/knowledgeQueue.test.ts
```

Expected: PASS

- [ ] **Step 2: Run type-check for server**

```bash
cd /Users/niujin/develop/MoreChat/apps/server
pnpm type-check
```

Expected: PASS

- [ ] **Step 3: Commit any final test or type-fix adjustments**

```bash
git add apps/server
git commit -m "test(digest): verify phase 2d digest workflow coverage"
```

## Notes For The Implementer

- Keep automatic digest soft-failure behavior. Queue handlers should log failures, not crash startup or block message ingestion.
- Keep manual API failures explicit. `DigestRangeTooSmallError` should still map to HTTP 400; LLM/config failures should still map to 503/500 as appropriate.
- Do not add UI or query endpoints for `KnowledgeCard` in this phase.
- Prefer `logger.warn({ err: error, ... })` or `logger.error({ err: error, ... })` over stringifying errors.
- Do not introduce a general job table, retry engine, or background scheduler in this phase.

Plan complete and saved to `docs/superpowers/plans/2026-04-26-phase2d-digest-knowledge-extraction.md`. Ready to execute?
