PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'window',
    "status" TEXT NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "sourceCardCount" INTEGER NOT NULL DEFAULT 0,
    "clusterKey" TEXT,
    "firstSeenAt" INTEGER NOT NULL,
    "lastSeenAt" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Topic" (
    "id",
    "kind",
    "status",
    "title",
    "summary",
    "description",
    "keywords",
    "messageCount",
    "participantCount",
    "sourceCardCount",
    "clusterKey",
    "firstSeenAt",
    "lastSeenAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    'window',
    'active',
    "title",
    "title",
    "description",
    '[]',
    "messageCount",
    0,
    0,
    NULL,
    "firstSeenAt",
    "lastSeenAt",
    "createdAt",
    "updatedAt"
FROM "Topic";

DROP TABLE "Topic";
ALTER TABLE "new_Topic" RENAME TO "Topic";

CREATE INDEX "Topic_lastSeenAt_idx" ON "Topic"("lastSeenAt");
CREATE INDEX "Topic_status_lastSeenAt_idx" ON "Topic"("status", "lastSeenAt");

CREATE TABLE "TopicKnowledgeCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "knowledgeCardId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicKnowledgeCard_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TopicKnowledgeCard_topicId_knowledgeCardId_key"
ON "TopicKnowledgeCard"("topicId", "knowledgeCardId");
CREATE INDEX "TopicKnowledgeCard_topicId_idx" ON "TopicKnowledgeCard"("topicId");
CREATE INDEX "TopicKnowledgeCard_knowledgeCardId_idx" ON "TopicKnowledgeCard"("knowledgeCardId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
