-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "lastSyncAt" DATETIME;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "lastSyncAt" DATETIME;

-- CreateTable
CREATE TABLE "file_cache" (
    "msg_id" TEXT NOT NULL PRIMARY KEY,
    "file_name" TEXT NOT NULL,
    "file_ext" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "aes_key" TEXT NOT NULL,
    "cdn_file_id" TEXT NOT NULL,
    "md5" TEXT,
    "oss_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloaded_at" DATETIME
);

-- CreateTable
CREATE TABLE "MessageTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "msgId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MessageEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "msgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DigestEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "startTime" INTEGER NOT NULL,
    "endTime" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" INTEGER NOT NULL,
    "lastSeenAt" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TopicMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    CONSTRAINT "TopicMessage_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportanceRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MessageIndex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    "msgType" INTEGER NOT NULL,
    "fromUsername" TEXT NOT NULL,
    "toUsername" TEXT NOT NULL,
    "chatroomSender" TEXT,
    "createTime" INTEGER NOT NULL,
    "dataLakeKey" TEXT NOT NULL,
    "isRecalled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageIndex_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MessageIndex" ("chatroomSender", "conversationId", "createTime", "createdAt", "dataLakeKey", "fromUsername", "id", "msgId", "msgType", "toUsername") SELECT "chatroomSender", "conversationId", "createTime", "createdAt", "dataLakeKey", "fromUsername", "id", "msgId", "msgType", "toUsername" FROM "MessageIndex";
DROP TABLE "MessageIndex";
ALTER TABLE "new_MessageIndex" RENAME TO "MessageIndex";
CREATE UNIQUE INDEX "MessageIndex_msgId_key" ON "MessageIndex"("msgId");
CREATE INDEX "MessageIndex_conversationId_idx" ON "MessageIndex"("conversationId");
CREATE INDEX "MessageIndex_createTime_idx" ON "MessageIndex"("createTime");
CREATE INDEX "MessageIndex_conversationId_createTime_idx" ON "MessageIndex"("conversationId", "createTime");
CREATE INDEX "MessageIndex_fromUsername_idx" ON "MessageIndex"("fromUsername");
CREATE INDEX "MessageIndex_toUsername_idx" ON "MessageIndex"("toUsername");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "file_cache_status_idx" ON "file_cache"("status");

-- CreateIndex
CREATE INDEX "MessageTag_msgId_idx" ON "MessageTag"("msgId");

-- CreateIndex
CREATE INDEX "MessageTag_tag_idx" ON "MessageTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTag_msgId_tag_source_key" ON "MessageTag"("msgId", "tag", "source");

-- CreateIndex
CREATE INDEX "MessageEntity_msgId_idx" ON "MessageEntity"("msgId");

-- CreateIndex
CREATE INDEX "MessageEntity_type_idx" ON "MessageEntity"("type");

-- CreateIndex
CREATE INDEX "MessageEntity_value_idx" ON "MessageEntity"("value");

-- CreateIndex
CREATE INDEX "DigestEntry_conversationId_idx" ON "DigestEntry"("conversationId");

-- CreateIndex
CREATE INDEX "DigestEntry_startTime_idx" ON "DigestEntry"("startTime");

-- CreateIndex
CREATE INDEX "Topic_lastSeenAt_idx" ON "Topic"("lastSeenAt");

-- CreateIndex
CREATE INDEX "TopicMessage_topicId_idx" ON "TopicMessage"("topicId");

-- CreateIndex
CREATE INDEX "TopicMessage_msgId_idx" ON "TopicMessage"("msgId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicMessage_topicId_msgId_key" ON "TopicMessage"("topicId", "msgId");

-- CreateIndex
CREATE INDEX "ImportanceRule_type_isActive_idx" ON "ImportanceRule"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_clientId_groupId_key" ON "Conversation"("clientId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_clientId_contactId_key" ON "Conversation"("clientId", "contactId");
