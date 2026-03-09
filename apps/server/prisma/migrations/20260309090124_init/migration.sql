-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guid" TEXT NOT NULL,
    "proxy" TEXT,
    "isLoginProxy" BOOLEAN NOT NULL DEFAULT false,
    "bridge" TEXT,
    "syncHistoryMsg" BOOLEAN NOT NULL DEFAULT true,
    "autoStart" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "loginStatus" TEXT NOT NULL DEFAULT 'offline',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "remark" TEXT,
    "avatar" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomUsername" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "nickname" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupMember_username_fkey" FOREIGN KEY ("username") REFERENCES "Contact" ("username") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contactId" TEXT,
    "groupId" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageIndex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "msgId" TEXT NOT NULL,
    "msgType" INTEGER NOT NULL,
    "fromUsername" TEXT NOT NULL,
    "toUsername" TEXT NOT NULL,
    "chatroomSender" TEXT,
    "createTime" INTEGER NOT NULL,
    "dataLakeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageIndex_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageStateChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "msgId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeTime" INTEGER NOT NULL,
    "changeData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_guid_key" ON "Client"("guid");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_username_key" ON "Contact"("username");

-- CreateIndex
CREATE INDEX "Contact_nickname_idx" ON "Contact"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "Group_roomUsername_key" ON "Group"("roomUsername");

-- CreateIndex
CREATE INDEX "Group_name_idx" ON "Group"("name");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_idx" ON "GroupMember"("groupId");

-- CreateIndex
CREATE INDEX "GroupMember_username_idx" ON "GroupMember"("username");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_username_key" ON "GroupMember"("groupId", "username");

-- CreateIndex
CREATE INDEX "Conversation_clientId_idx" ON "Conversation"("clientId");

-- CreateIndex
CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");

-- CreateIndex
CREATE INDEX "Conversation_groupId_idx" ON "Conversation"("groupId");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_clientId_lastMessageAt_idx" ON "Conversation"("clientId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageIndex_msgId_key" ON "MessageIndex"("msgId");

-- CreateIndex
CREATE INDEX "MessageIndex_conversationId_idx" ON "MessageIndex"("conversationId");

-- CreateIndex
CREATE INDEX "MessageIndex_createTime_idx" ON "MessageIndex"("createTime");

-- CreateIndex
CREATE INDEX "MessageIndex_conversationId_createTime_idx" ON "MessageIndex"("conversationId", "createTime");

-- CreateIndex
CREATE INDEX "MessageIndex_fromUsername_idx" ON "MessageIndex"("fromUsername");

-- CreateIndex
CREATE INDEX "MessageIndex_toUsername_idx" ON "MessageIndex"("toUsername");

-- CreateIndex
CREATE INDEX "MessageStateChange_msgId_idx" ON "MessageStateChange"("msgId");

-- CreateIndex
CREATE INDEX "MessageStateChange_changeTime_idx" ON "MessageStateChange"("changeTime");

-- CreateIndex
CREATE INDEX "MessageStateChange_msgId_changeTime_idx" ON "MessageStateChange"("msgId", "changeTime");
