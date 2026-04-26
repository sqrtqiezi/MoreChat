# Phase 2E Topic Clustering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add event-driven topic clustering on top of `KnowledgeCard`, producing window-scoped `Topic` records, explicit `TopicKnowledgeCard` memberships, and backfilled `TopicMessage` links.

**Architecture:** Treat `KnowledgeCard` as the clustering input unit, not raw messages. Extend `Topic` into a real window-topic model, add `TopicKnowledgeCard` for membership, and implement `TopicCandidateService`, `TopicClusteringService`, `TopicBackfillService`, and `TopicRepairService`. Event-driven queue handlers perform incremental clustering; a repair job re-evaluates recent topics without introducing new infrastructure.

**Tech Stack:** Prisma + SQLite + existing `EmbeddingService` + existing `KnowledgeQueue` + Hono + Vitest

---

## Spec Reference

- `docs/superpowers/specs/2026-04-26-phase2e-topic-clustering-design.md`

## Scope Decision

This plan stays within one subsystem: backend topic clustering for window topics. It does not implement long-lived-topic aggregation, graph modeling, or full topic UI design.

## File Structure

### Modify

- `apps/server/prisma/schema.prisma`
  Extend `Topic` and add `TopicKnowledgeCard`.
- `apps/server/prisma/migrations/<timestamp>_phase2e_topic_clustering/migration.sql`
  Persist schema changes for existing environments.
- `apps/server/src/services/database.ts`
  Keep test DB bootstrap aligned with the new `Topic` and `TopicKnowledgeCard` tables.
- `apps/server/src/services/database.test.ts`
  Add integration assertions for topic persistence.
- `apps/server/src/services/knowledgeQueue.ts`
  Extend queue typing for `topic-clustering` tasks if the implementation chooses stronger task unions.
- `apps/server/src/services/knowledgeQueue.test.ts`
  Cover the new topic-clustering task shape.
- `apps/server/src/services/digestWorkflowService.ts`
  Enqueue topic clustering after successful `KnowledgeCard` extraction.
- `apps/server/src/services/digestWorkflowService.test.ts`
  Assert topic task enqueueing or workflow callback behavior after extraction.
- `apps/server/src/index.ts`
  Wire topic services, queue handlers, and repair scheduler.
- `apps/server/src/app.ts`
  Mount topic query routes if they are included in this phase.

### Create

- `apps/server/src/services/topicCandidateService.ts`
  Build topic input text from `KnowledgeCard` and generate embeddings.
- `apps/server/src/services/topicCandidateService.test.ts`
  Unit tests for text composition and embedding calls.
- `apps/server/src/services/topicClusteringService.ts`
  Incrementally assign a `KnowledgeCard` to up to three window topics or create a new topic.
- `apps/server/src/services/topicClusteringService.test.ts`
  Unit tests for assign-existing, create-new, and max-three behavior.
- `apps/server/src/services/topicBackfillService.ts`
  Backfill `TopicMessage` from the digest window behind each `KnowledgeCard`.
- `apps/server/src/services/topicBackfillService.test.ts`
  Unit tests for message lookup and idempotent `TopicMessage` writes.
- `apps/server/src/services/topicRepairService.ts`
  Re-evaluate recent topics and weak memberships on a timer.
- `apps/server/src/services/topicRepairService.test.ts`
  Unit tests for recent-topic selection and no-op-safe repair behavior.
- `apps/server/src/routes/topics.ts`
  Minimal topic listing and topic-messages query API.
- `apps/server/src/routes/topics.test.ts`
  Route tests for the minimal topic API.

## Chunk 1: Topic Persistence Layer

### Task 1: Extend Topic Schema And Add TopicKnowledgeCard

**Files:**
- Modify: `apps/server/prisma/schema.prisma`
- Create: `apps/server/prisma/migrations/<timestamp>_phase2e_topic_clustering/migration.sql`
- Modify: `apps/server/src/services/database.ts`
- Modify: `apps/server/src/services/database.test.ts`

- [ ] **Step 1: Write the failing database integration test**

Add a test to `database.test.ts` that writes:

- one `Topic` with `kind`, `status`, `summary`, `keywords`, `participantCount`, `sourceCardCount`, `clusterKey`
- one `TopicKnowledgeCard` linking a topic and a knowledge card

Example:

```typescript
it('persists topic metadata and topic knowledge-card memberships', async () => {
  const digest = await db.prisma.digestEntry.create({
    data: {
      conversationId: 'conv_topic',
      startTime: 100,
      endTime: 200,
      summary: '摘要',
      messageCount: 3,
      sourceKind: 'manual',
      status: 'ready',
    },
  })

  const card = await db.prisma.knowledgeCard.create({
    data: {
      digestEntryId: digest.id,
      conversationId: 'conv_topic',
      title: '预算讨论',
      summary: '讨论预算审批',
      decisions: '[]',
      actionItems: '[]',
      risks: '[]',
      participants: '[]',
      timeAnchors: '[]',
    },
  })

  const topic = await db.prisma.topic.create({
    data: {
      kind: 'window',
      status: 'active',
      title: '预算主题',
      summary: '近期预算讨论',
      description: null,
      keywords: '["预算","审批"]',
      messageCount: 0,
      participantCount: 2,
      sourceCardCount: 1,
      clusterKey: 'budget-window',
      firstSeenAt: 100,
      lastSeenAt: 200,
    },
  })

  const membership = await db.prisma.topicKnowledgeCard.create({
    data: {
      topicId: topic.id,
      knowledgeCardId: card.id,
      score: 0.91,
      rank: 1,
    },
  })

  expect(membership.topicId).toBe(topic.id)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/database.test.ts`

Expected: FAIL because `Topic` fields and `TopicKnowledgeCard` do not exist.

- [ ] **Step 3: Extend `schema.prisma`**

Modify `Topic` to include:

```prisma
model Topic {
  id               String   @id @default(cuid())
  kind             String
  status           String
  title            String
  summary          String
  description      String?
  keywords         String
  messageCount     Int      @default(0)
  participantCount Int      @default(0)
  sourceCardCount  Int      @default(0)
  clusterKey       String?
  firstSeenAt      Int
  lastSeenAt       Int
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  messages        TopicMessage[]
  knowledgeCards  TopicKnowledgeCard[]

  @@index([lastSeenAt])
  @@index([status, lastSeenAt])
}
```

Add:

```prisma
model TopicKnowledgeCard {
  id              String   @id @default(cuid())
  topicId         String
  knowledgeCardId String
  score           Float
  rank            Int
  createdAt       DateTime @default(now())

  topic Topic @relation(fields: [topicId], references: [id], onDelete: Cascade)

  @@unique([topicId, knowledgeCardId])
  @@index([topicId])
  @@index([knowledgeCardId])
}
```

- [ ] **Step 4: Write the migration SQL**

Migration requirements:

- redefine `Topic` to add the new metadata columns
- backfill legacy topics with `kind='window'`, `status='active'`, `summary=title`, `keywords='[]'`, `participantCount=0`, `sourceCardCount=0`, `clusterKey=NULL`
- create `TopicKnowledgeCard`
- add the new indexes

- [ ] **Step 5: Update `database.ts` test bootstrap**

Bring test bootstrap in sync:

- create `Topic` with all new fields
- create `TopicKnowledgeCard`
- add `ALTER TABLE` guards for any newly added `Topic` columns
- add indexes and the membership unique key

- [ ] **Step 6: Regenerate Prisma client and rerun the database test**

Run:

```bash
cd /Users/niujin/develop/MoreChat/apps/server
npx prisma generate
npx vitest run src/services/database.test.ts
```

Expected: PASS for the new persistence test.

- [ ] **Step 7: Commit**

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations apps/server/src/services/database.ts apps/server/src/services/database.test.ts
git commit -m "feat(topic): add phase 2e topic models"
```

## Chunk 2: Candidate Embeddings And Incremental Clustering

### Task 2: Create TopicCandidateService

**Files:**
- Create: `apps/server/src/services/topicCandidateService.ts`
- Create: `apps/server/src/services/topicCandidateService.test.ts`

- [ ] **Step 1: Write the failing unit tests**

```typescript
describe('TopicCandidateService', () => {
  it('builds stable topic input text from a knowledge card', async () => {
    const service = new TopicCandidateService(mockEmbedding)

    mockEmbedding.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3])

    const candidate = await service.buildCandidate({
      id: 'card_1',
      title: '预算讨论',
      summary: '讨论预算审批与周五上线',
      decisions: '["本周五上线"]',
      actionItems: '["Alice 提交预算表"]',
      risks: '[]',
      participants: '[]',
      timeAnchors: '[]',
    } as any)

    expect(candidate.text).toContain('预算讨论')
    expect(candidate.text).toContain('本周五上线')
    expect(candidate.embedding).toEqual([0.1, 0.2, 0.3])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/topicCandidateService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement `TopicCandidateService`**

Suggested shape:

```typescript
export interface TopicCandidate {
  knowledgeCardId: string
  conversationId: string
  text: string
  embedding: number[]
}

export class TopicCandidateService {
  async buildCandidate(card: KnowledgeCardLike): Promise<TopicCandidate> {
    // compose text from title + summary + decisions + actionItems
    // call EmbeddingService.generateEmbedding
  }
}
```

Implementation rules:

- parse `decisions` and `actionItems` from JSON safely
- tolerate empty arrays
- ignore `risks`, `participants`, and `timeAnchors` in first-pass text composition

- [ ] **Step 4: Add edge-case tests**

Add tests for:

- malformed array JSON falling back to `[]`
- empty `decisions` and `actionItems`
- embedding-service failure propagation

- [ ] **Step 5: Run the candidate tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/topicCandidateService.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/topicCandidateService.ts apps/server/src/services/topicCandidateService.test.ts
git commit -m "feat(topic): add topic candidate embedding service"
```

### Task 3: Create TopicClusteringService

**Files:**
- Create: `apps/server/src/services/topicClusteringService.ts`
- Create: `apps/server/src/services/topicClusteringService.test.ts`

- [ ] **Step 1: Write the failing clustering tests**

Cover three behaviors:

1. assign to an existing topic above the main threshold
2. create a new topic when nothing matches
3. never assign more than three topics

Example:

```typescript
it('assigns a card to the best matching active topic', async () => {
  mockCandidateService.buildCandidate.mockResolvedValue({
    knowledgeCardId: 'card_1',
    conversationId: 'conv_1',
    text: '预算讨论 周五上线',
    embedding: [1, 0, 0],
  })
  mockDb.prisma.topic.findMany.mockResolvedValue([
    { id: 'topic_1', title: '预算主题', summary: '近期预算', keywords: '[]', lastSeenAt: 100, firstSeenAt: 90, messageCount: 5, participantCount: 2, sourceCardCount: 2, kind: 'window', status: 'active' },
  ])
  mockDb.prisma.topicKnowledgeCard.upsert.mockResolvedValue({})

  await service.clusterKnowledgeCard(card)

  expect(mockDb.prisma.topicKnowledgeCard.upsert).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/topicClusteringService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement `TopicClusteringService`**

Suggested shape:

```typescript
export interface ClusterResult {
  topicIds: string[]
}

export class TopicClusteringService {
  async clusterKnowledgeCard(card: KnowledgeCardLike): Promise<ClusterResult> {
    // build candidate
    // load recent active topics
    // score candidates
    // upsert TopicKnowledgeCard
    // update or create Topic rows
  }
}
```

Implementation requirements:

- use cosine similarity locally
- keep a `mainThreshold` and `secondaryThreshold`
- limit assignments to top 3 matching topics
- create a new topic if no candidate crosses the main threshold
- update `sourceCardCount`, `lastSeenAt`, and `firstSeenAt` when a card is attached
- keep `kind='window'` and `status='active'` for all new topics in first pass

- [ ] **Step 4: Make topic creation deterministic enough for tests**

For the first version:

- derive `title` from `KnowledgeCard.title`
- set `summary` from `KnowledgeCard.summary`
- derive `keywords` from a simple unique keyword list built from title/summary tokens or leave a minimal placeholder such as `[]`
- set `clusterKey` to `null` unless a strong deterministic key naturally exists

- [ ] **Step 5: Add tests for multi-topic assignment**

Specifically assert:

- rank 1/2/3 are stored correctly
- a weak 4th topic is ignored
- a weak single-topic result creates a new topic instead

- [ ] **Step 6: Run the clustering tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/topicClusteringService.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/topicClusteringService.ts apps/server/src/services/topicClusteringService.test.ts
git commit -m "feat(topic): add incremental topic clustering service"
```

## Chunk 3: Message Backfill And Workflow Integration

### Task 4: Create TopicBackfillService

**Files:**
- Create: `apps/server/src/services/topicBackfillService.ts`
- Create: `apps/server/src/services/topicBackfillService.test.ts`

- [ ] **Step 1: Write the failing backfill tests**

```typescript
describe('TopicBackfillService', () => {
  it('backfills TopicMessage rows from the digest window behind a knowledge card', async () => {
    mockDb.prisma.digestEntry.findUnique.mockResolvedValue({
      id: 'digest_1',
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
    })
    mockDb.prisma.messageIndex.findMany.mockResolvedValue([
      { msgId: 'm1' },
      { msgId: 'm2' },
    ])

    await service.backfillTopicMessages({
      topicIds: ['topic_1'],
      knowledgeCard: { digestEntryId: 'digest_1' } as any,
    })

    expect(mockDb.prisma.topicMessage.createMany).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/topicBackfillService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement `TopicBackfillService`**

Suggested shape:

```typescript
export class TopicBackfillService {
  async backfillTopicMessages(input: {
    topicIds: string[]
    knowledgeCard: { digestEntryId: string }
  }): Promise<void> {
    // load DigestEntry
    // load MessageIndex rows in window
    // idempotently create TopicMessage rows
  }
}
```

Implementation rules:

- if `DigestEntry` is missing, no-op
- insert all window messages for each assigned topic
- use `createMany({ skipDuplicates: true })` if Prisma/sqlite behavior allows; otherwise fall back to guarded per-row writes

- [ ] **Step 4: Add edge-case tests**

Add tests for:

- missing `DigestEntry`
- empty message window
- repeated backfill does not duplicate `TopicMessage`

- [ ] **Step 5: Run the backfill tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/topicBackfillService.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/topicBackfillService.ts apps/server/src/services/topicBackfillService.test.ts
git commit -m "feat(topic): backfill topic messages from digest windows"
```

### Task 5: Wire Topic Clustering Into The Existing Digest Workflow

**Files:**
- Modify: `apps/server/src/services/digestWorkflowService.ts`
- Modify: `apps/server/src/services/digestWorkflowService.test.ts`
- Modify: `apps/server/src/services/knowledgeQueue.ts`
- Modify: `apps/server/src/services/knowledgeQueue.test.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Write failing workflow tests first**

Update `digestWorkflowService.test.ts` so a successful extraction also emits clustering work through one of these patterns:

- inject a callback such as `onKnowledgeCardCreated`
- or inject a small topic-workflow dependency

Example expectation:

```typescript
expect(mockOnKnowledgeCardCreated).toHaveBeenCalledWith(knowledgeCard)
```

Use whichever pattern keeps `DigestWorkflowService` narrow.

- [ ] **Step 2: Run the workflow and queue tests to verify they fail**

Run:

```bash
cd /Users/niujin/develop/MoreChat/apps/server
npx vitest run src/services/digestWorkflowService.test.ts
npx vitest run src/services/knowledgeQueue.test.ts
```

Expected: FAIL because topic-clustering is not yet part of the workflow.

- [ ] **Step 3: Keep `DigestWorkflowService` small**

Recommended approach:

- inject an optional callback `(knowledgeCard) => Promise<void>`
- call it only after successful extraction
- swallow callback failures with logging, just like extraction already soft-fails

That avoids bloating digest orchestration with topic logic.

- [ ] **Step 4: Register `topic-clustering` in `index.ts`**

Wire:

- `TopicCandidateService`
- `TopicClusteringService`
- `TopicBackfillService`

Queue handler shape:

```typescript
knowledgeQueue.registerHandler('topic-clustering', async (task) => {
  try {
    const card = await databaseService.prisma.knowledgeCard.findUnique({ where: { id: task.data.knowledgeCardId } })
    if (!card) return

    const result = await topicClusteringService.clusterKnowledgeCard(card)
    await topicBackfillService.backfillTopicMessages({
      topicIds: result.topicIds,
      knowledgeCard: card,
    })
  } catch (error) {
    logger.error({ err: error, knowledgeCardId: task.data.knowledgeCardId }, 'Failed to process topic clustering task')
  }
})
```

- [ ] **Step 5: Update queue typing if needed**

If you convert `KnowledgeTask` to a discriminated union, include:

```typescript
| { type: 'topic-clustering'; msgId: string; data: { knowledgeCardId: string } }
```

Keep the change pragmatic; do not rewrite the queue abstraction beyond what this phase needs.

- [ ] **Step 6: Run the workflow and queue tests**

Run:

```bash
cd /Users/niujin/develop/MoreChat/apps/server
npx vitest run src/services/digestWorkflowService.test.ts
npx vitest run src/services/knowledgeQueue.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/digestWorkflowService.ts apps/server/src/services/digestWorkflowService.test.ts apps/server/src/services/knowledgeQueue.ts apps/server/src/services/knowledgeQueue.test.ts apps/server/src/index.ts
git commit -m "feat(topic): enqueue clustering after knowledge extraction"
```

## Chunk 4: Repair And Query Surface

### Task 6: Create TopicRepairService

**Files:**
- Create: `apps/server/src/services/topicRepairService.ts`
- Create: `apps/server/src/services/topicRepairService.test.ts`

- [ ] **Step 1: Write the failing repair tests**

Cover a deliberately narrow first version:

- selects recent active topics only
- no-ops safely when there are none
- can mark obviously stale topics as `stale`

Example:

```typescript
it('marks old inactive window topics as stale during repair', async () => {
  mockDb.prisma.topic.findMany.mockResolvedValue([
    { id: 'topic_1', status: 'active', lastSeenAt: 100 },
  ])

  await service.repairRecentTopics({ now: 10_000 })

  expect(mockDb.prisma.topic.update).toHaveBeenCalledWith({
    where: { id: 'topic_1' },
    data: { status: 'stale' },
  })
})
```

- [ ] **Step 2: Run the repair test to verify it fails**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/topicRepairService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement a conservative repair service**

First version responsibilities:

- fetch recent active topics
- optionally mark clearly expired ones as `stale`
- leave merge/reassign logic as future work unless it is trivial and well-covered

Keep this intentionally small. Do not build a full reclustering system in v1.

- [ ] **Step 4: Add a scheduler hook in `index.ts`**

Add a timer with a safe interval and a shutdown hook. Use existing service-start patterns from the app.

- [ ] **Step 5: Run the repair tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/services/topicRepairService.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/topicRepairService.ts apps/server/src/services/topicRepairService.test.ts apps/server/src/index.ts
git commit -m "feat(topic): add recent topic repair service"
```

### Task 7: Add Minimal Topics API

**Files:**
- Create: `apps/server/src/routes/topics.ts`
- Create: `apps/server/src/routes/topics.test.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Write the failing route tests**

Support two endpoints only:

- `GET /api/topics?limit=&offset=`
- `GET /api/topics/:topicId/messages`

Example:

```typescript
it('lists recent window topics', async () => {
  mockDb.prisma.topic.findMany.mockResolvedValue([
    { id: 'topic_1', title: '预算主题', summary: '近期预算讨论', kind: 'window', status: 'active' },
  ])

  const res = await app.request('/api/topics?limit=10&offset=0', {
    headers: { Authorization: 'Bearer test' },
  })

  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/topics.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement `topics.ts`**

Keep the API minimal:

- list only `kind='window'` topics
- sort by `lastSeenAt desc`
- fetch topic messages by joining `TopicMessage -> MessageIndex`

Do not over-design pagination or filtering in this phase.

- [ ] **Step 4: Mount the route in `app.ts`**

Inject `db` the same way `entities` and `rules` routes do.

- [ ] **Step 5: Run the route tests**

Run: `cd /Users/niujin/develop/MoreChat/apps/server && npx vitest run src/routes/topics.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/topics.ts apps/server/src/routes/topics.test.ts apps/server/src/app.ts
git commit -m "feat(topic): add minimal topics query API"
```

## Chunk 5: Final Verification

### Task 8: Run Focused Regression Coverage

**Files:**
- Test: `apps/server/src/services/database.test.ts`
- Test: `apps/server/src/services/topicCandidateService.test.ts`
- Test: `apps/server/src/services/topicClusteringService.test.ts`
- Test: `apps/server/src/services/topicBackfillService.test.ts`
- Test: `apps/server/src/services/topicRepairService.test.ts`
- Test: `apps/server/src/services/digestWorkflowService.test.ts`
- Test: `apps/server/src/services/knowledgeQueue.test.ts`
- Test: `apps/server/src/routes/topics.test.ts`

- [ ] **Step 1: Run the focused test suite**

```bash
cd /Users/niujin/develop/MoreChat/apps/server
npx vitest run src/services/database.test.ts
npx vitest run src/services/topicCandidateService.test.ts
npx vitest run src/services/topicClusteringService.test.ts
npx vitest run src/services/topicBackfillService.test.ts
npx vitest run src/services/topicRepairService.test.ts
npx vitest run src/services/digestWorkflowService.test.ts
npx vitest run src/services/knowledgeQueue.test.ts
npx vitest run src/routes/topics.test.ts
```

Expected: PASS

- [ ] **Step 2: Run server type-check**

```bash
cd /Users/niujin/develop/MoreChat/apps/server
pnpm type-check
```

Expected: PASS

- [ ] **Step 3: Commit final test or type-fix adjustments**

```bash
git add apps/server
git commit -m "test(topic): verify phase 2e topic clustering coverage"
```

## Notes For The Implementer

- Keep topic clustering asynchronous and soft-failing. `KnowledgeCard` generation remains the durable boundary.
- Do not reintroduce message-level clustering in this phase.
- Keep long-lived topics out of the implementation even if the schema leaves room for them later.
- Prefer small deterministic heuristics for `Topic.title`, `Topic.summary`, and `keywords` in v1; avoid hidden LLM calls inside clustering.
- If SQLite or Prisma makes bulk deduplication awkward for `TopicMessage`, prefer explicit idempotent writes over clever abstractions.
- Use `logger.warn({ err: error, ... })` and `logger.error({ err: error, ... })` consistently.

Plan complete and saved to `docs/superpowers/plans/2026-04-26-phase2e-topic-clustering.md`. Ready to execute?
