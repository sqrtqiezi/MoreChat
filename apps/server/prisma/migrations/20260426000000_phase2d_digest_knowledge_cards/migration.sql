-- Redefine DigestEntry to add phase 2d metadata columns and unique window key
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DigestEntry" (
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_DigestEntry" (
    "id",
    "conversationId",
    "startTime",
    "endTime",
    "summary",
    "messageCount",
    "sourceKind",
    "triggerMsgId",
    "status",
    "errorMessage",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "conversationId",
    "startTime",
    "endTime",
    "summary",
    "messageCount",
    'manual',
    NULL,
    'ready',
    NULL,
    "createdAt",
    "createdAt"
FROM "DigestEntry";

DROP TABLE "DigestEntry";
ALTER TABLE "new_DigestEntry" RENAME TO "DigestEntry";

CREATE INDEX "DigestEntry_conversationId_idx" ON "DigestEntry"("conversationId");
CREATE INDEX "DigestEntry_startTime_idx" ON "DigestEntry"("startTime");
CREATE UNIQUE INDEX "DigestEntry_conversationId_startTime_endTime_sourceKind_key"
ON "DigestEntry"("conversationId", "startTime", "endTime", "sourceKind");

-- Create structured knowledge card table
CREATE TABLE "KnowledgeCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "digestEntryId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "decisions" TEXT NOT NULL,
    "actionItems" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "timeAnchors" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeCard_digestEntryId_fkey" FOREIGN KEY ("digestEntryId") REFERENCES "DigestEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "KnowledgeCard_digestEntryId_key" ON "KnowledgeCard"("digestEntryId");
CREATE INDEX "KnowledgeCard_conversationId_idx" ON "KnowledgeCard"("conversationId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
