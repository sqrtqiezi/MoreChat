# MoreChat 知识库重构设计

**日期：** 2026-04-24  
**状态：** 总体设计，细化方案见分阶段 specs  
**目标：** 将 MoreChat 从"微信 Web 客户端"重构为"微信消息知识库"

> 注：本文档是知识库重构的总纲。摘要生成与知识提炼已在
> `docs/superpowers/specs/2026-04-26-phase2d-digest-knowledge-extraction-design.md`
> 细化；主题聚类已在
> `docs/superpowers/specs/2026-04-26-phase2e-topic-clustering-design.md`
> 细化。若本文与分阶段 spec 冲突，以分阶段 spec 为准。

---

## 一、背景与目标

### 当前问题

MoreChat 当前实现偏向了"微信 Web 客户端复刻"的方向，大量精力花在：
- 聊天 UI 交互细节（滚动、新消息提示）
- 消息发送能力（文本、图片、引用消息）
- 媒体文件处理（图片/表情/文件下载到 OSS）
- 实时通信（WebSocket 复杂事件）

而核心的知识库能力完全缺失：
- ❌ 没有搜索功能
- ❌ 没有信息提炼/摘要
- ❌ 没有重要消息标记/过滤
- ❌ 没有知识提取和组织

### 核心目标

重新聚焦到初衷：构建一个**微信消息知识库系统**，核心能力包括：

1. **消息归档** — 保存所有微信消息（已实现，保持不变）
2. **重要消息识别** — 多维度识别不容错过的信息
   - 关注人（特定联系人/群组）
   - 关键词匹配
   - @我检测
   - 基于语义的 AI 识别

3. **全方位搜索** — 随时搜索历史消息
   - 关键词搜索（中文分词）
   - 高级筛选（时间、联系人、类型组合）
   - 语义搜索（自然语言查询）

4. **知识提炼** — 从海量消息中提取有效信息
   - 自动摘要（对话段落总结）
   - 实体提取（人名、项目、日期、待办）
   - 主题聚类（相关消息自动归类）

### 技术约束

- **混合 AI 方案**：本地模型处理轻量任务（分类、实体提取），云端 LLM 处理重度任务（摘要、深度语义理解）
- **混合处理策略**：自动处理重要消息 + 支持手动触发
- **资源限制**：服务器资源短缺，不使用 Docker，直接部署，控制内存占用

---

## 二、整体架构

```
┌─────────────────────────────────────────────────┐
│                  前端（知识库 UI）                │
│   搜索中心 │ 重要消息 Feed │ 知识摘要 │ 对话浏览 │
├─────────────────────────────────────────────────┤
│                  API 层（Hono）                  │
│   /search  │ /highlights │ /digest │ /messages  │
├──────────────────┬──────────────────────────────┤
│   搜索引擎层      │      知识处理管道             │
│  DuckDB          │  规则引擎 + 本地AI + 云端AI   │
│  (FTS + VSS)     │                              │
├──────────────────┴──────────────────────────────┤
│              消息存储层（保留现有）                │
│   DataLake (JSON) + MessageIndex (SQLite)       │
│   + Webhook 接收 + 联系人同步                    │
└─────────────────────────────────────────────────┘
```

核心原则：
- 消息存储层基本不动，它是整个系统的基础
- 搜索引擎层和知识处理管道作为独立的服务模块新增
- 前端从"聊天客户端"重构为"知识库界面"
- 消息进入系统后，除了存储，还会经过知识处理管道进行分析

---

## 三、搜索引擎层（DuckDB 统一方案）

**核心决策：使用 DuckDB 统一处理全文检索和向量搜索**，替代 Meilisearch + lancedb 的组合方案。

**优势：**
- 零额外进程，嵌入式数据库
- 内存占用大幅降低（~100MB vs ~306MB）
- 可直接查询 DataLake 的 JSON 文件
- SQL 统一查询接口

### 3.1 DuckDB 架构

DuckDB 作为搜索引擎，提供三种搜索能力：

1. **全文检索（FTS 扩展）**
   - 使用 DuckDB FTS 扩展建立全文索引
   - 中文分词：写入前用 jieba-js 预分词，存储分词后的文本
   - 支持关键词匹配、短语搜索

2. **向量搜索（VSS 扩展）**
   - 使用 DuckDB VSS (Vector Similarity Search) 扩展
   - HNSW 索引，支持余弦相似度、欧氏距离、内积
   - 本地嵌入模型（bge-small-zh，~50MB）生成向量
   - 使用 ONNX Runtime 在 Node.js 进程内运行

3. **结构化筛选（标准 SQL）**
   - 时间范围、联系人/群组、消息类型、重要性、标签
   - 可与全文检索和向量搜索组合

### 3.2 数据存储结构

DuckDB 中建立两张表：

```sql
-- 全文检索表
CREATE TABLE message_fts (
  msg_id VARCHAR PRIMARY KEY,
  content_tokens VARCHAR,  -- jieba 分词后的文本，空格分隔
  create_time BIGINT,
  from_username VARCHAR,
  to_username VARCHAR
);

CREATE INDEX idx_fts ON message_fts USING FTS(content_tokens);

-- 向量搜索表
CREATE TABLE message_vectors (
  msg_id VARCHAR PRIMARY KEY,
  embedding FLOAT[768],  -- 向量维度取决于嵌入模型
  create_time BIGINT
);

CREATE INDEX idx_vector ON message_vectors 
  USING HNSW (embedding) 
  WITH (metric = 'cosine');
```

### 3.3 统一搜索流程

```
用户查询 "上周在XX群讨论的预算"
    │
    ▼
SearchService 解析查询
    │
    ├─ 结构化条件 → SQLite MessageIndex
    │                  (群组=XX, 时间=上周)
    │                  → msgId 集合 A
    │
    ├─ 关键词 "预算" → DuckDB FTS
    │                  SELECT msg_id FROM message_fts
    │                  WHERE content_tokens LIKE '%预算%'
    │                  → msgId 集合 B
    │
    └─ 语义向量 → DuckDB VSS
                   SELECT msg_id FROM message_vectors
                   ORDER BY array_cosine_distance(embedding, query_vector)
                   LIMIT 100
                   → msgId 集合 C
    │
    ▼
合并 A ∩ (B ∪ C)，按相关性排序
    │
    ▼
从 DataLake 取完整消息内容返回
```

### 3.4 中文分词处理

由于 DuckDB FTS 不内置中文分词，需要在应用层处理：

```typescript
import jieba from 'nodejieba'

// 消息入库时
const tokens = jieba.cut(messageContent).join(' ')
await duckdb.run(
  'INSERT INTO message_fts VALUES (?, ?, ?, ?, ?)',
  [msgId, tokens, createTime, fromUsername, toUsername]
)

// 搜索时
const queryTokens = jieba.cut(searchQuery).join(' ')
const results = await duckdb.all(
  'SELECT msg_id FROM message_fts WHERE content_tokens LIKE ?',
  [`%${queryTokens}%`]
)
```

### 3.5 DuckDB 与 DataLake 的关系

- DuckDB 表是 DataLake 的**派生索引**，可随时重建
- 可选：使用 DuckDB 的 `read_json_auto()` 直接查询 DataLake JSON 文件（适合小规模数据）
- 推荐：维护独立的 DuckDB 索引表（适合大规模数据，查询性能更好）

---

## 四、知识处理管道

### 4.1 实时处理（消息入库时同步执行，本地完成）

1. **规则引擎** — 基于用户配置的规则判断消息重要性
   - 关注人列表：消息来自关注的联系人/群组 → 标记重要
   - 关键词匹配：消息包含配置的关键词 → 标记重要
   - @我检测：群消息中 @了当前用户 → 标记重要
   - 零成本、零延迟，在 webhook 处理消息时同步执行

2. **DuckDB FTS 索引写入** — 消息文本预分词后同步写入 DuckDB 全文索引

### 4.2 异步处理（后台队列，批量执行）

3. **向量嵌入生成** — 本地模型生成消息文本的 embedding，写入 DuckDB VSS
4. **语义重要性分析** — 本地小模型对未被规则命中的消息做轻量分类（是否包含待办、决策、问题等）
5. **实体提取** — 本地模型提取人名、项目名、日期、金额等结构化信息
6. **摘要生成（云端）** — 对标记为重要的消息所在的对话段落，调用云端 LLM 生成窗口摘要，并进一步提炼结构化知识
7. **主题聚类** — 以 `KnowledgeCard` 为主要输入进行增量聚类，再将原始消息回填到话题下

### 4.3 手动触发

- 用户选中任意对话/时间段，点击"生成摘要" → 调用云端 LLM
- 用户选中消息，点击"提取信息" → 调用云端 LLM 做深度分析

### 4.4 处理流程

```
消息到达 (webhook)
    │
    ├─ 同步 ─→ 存储 (DataLake + MessageIndex)
    ├─ 同步 ─→ 规则引擎 (关注人/关键词/@我) → MessageTag
    ├─ 同步 ─→ DuckDB FTS 索引写入
    │
    └─ 入队 ─→ 异步处理队列
                 ├─→ 向量嵌入生成 → DuckDB VSS
                 ├─→ 语义分类 (本地) → MessageTag
                 ├─→ 实体提取 (本地) → MessageEntity
                 └─→ 摘要生成 (云端, 仅重要消息) → DigestEntry → KnowledgeCard

KnowledgeCard 生成/更新
    │
    └─ 入队 ─→ 主题聚类 → Topic + TopicKnowledgeCard
                      └─→ 消息回填 → TopicMessage

定时任务 ─→ 主题修正 / 过期处理
```

---

## 五、数据模型变更

### 5.1 新增模型

```prisma
// 消息标签（重要、待办、决策等）
model MessageTag {
  id        String   @id @default(cuid())
  msgId     String
  tag       String   // "important", "todo", "decision", "question"
  source    String   // "rule:watchlist", "rule:keyword", "rule:mention", "ai:semantic"
  createdAt DateTime @default(now())

  @@index([msgId])
  @@index([tag])
  @@unique([msgId, tag, source])
}

// 提取的实体
model MessageEntity {
  id        String   @id @default(cuid())
  msgId     String
  type      String   // "person", "project", "date", "amount", "action_item"
  value     String
  createdAt DateTime @default(now())

  @@index([msgId])
  @@index([type])
  @@index([value])
}

// 摘要条目
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

// 从摘要中提炼出的结构化知识卡片
model KnowledgeCard {
  id             String   @id @default(cuid())
  digestEntryId  String   @unique
  conversationId String
  title          String
  summary        String
  decisions      String
  actionItems    String
  risks          String
  participants   String
  timeAnchors    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  digestEntry DigestEntry @relation(fields: [digestEntryId], references: [id], onDelete: Cascade)

  @@index([conversationId])
}

// 话题
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

  messages       TopicMessage[]
  knowledgeCards TopicKnowledgeCard[]

  @@index([lastSeenAt])
  @@index([status, lastSeenAt])
}

// 话题与消息关联
model TopicMessage {
  id      String @id @default(cuid())
  topicId String
  msgId   String

  topic Topic @relation(fields: [topicId], references: [id], onDelete: Cascade)

  @@unique([topicId, msgId])
  @@index([topicId])
  @@index([msgId])
}

// 话题与知识卡片关联
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

// 重要性规则配置
model ImportanceRule {
  id        String   @id @default(cuid())
  type      String   // "watchlist", "keyword", "mention"
  value     String   // 联系人username / 关键词 / "@me"
  priority  Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([type, isActive])
}
```

### 5.2 移除模型

```
EmojiCache  — 表情包缓存，随 EmojiService 一起移除
```

### 5.3 外部存储（非 SQLite）

- **DuckDB 数据库** — 包含两张表：
  - `message_fts`：全文检索索引（分词后的文本）
  - `message_vectors`：向量搜索索引（embeddings）
- 两者均为派生数据，可从 DataLake 重建

---

## 六、前端架构重构

### 6.1 界面布局

从"聊天客户端"转向"知识库优先"的界面：

```
┌────────────────────────────────────────────────────┐
│  Header: Logo │ 搜索框（全局）│ 用户信息           │
├────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────────────────┐   │
│  │  侧边栏       │  │   主内容区                │   │
│  │              │  │                          │   │
│  │ • 重要消息    │  │  [搜索结果 / Feed 流]     │   │
│  │ • 待办事项    │  │                          │   │
│  │ • 话题        │  │  ┌────────────────────┐  │   │
│  │ • 联系人      │  │  │ 消息卡片            │  │   │
│  │ • 群组        │  │  │ - 摘要              │  │   │
│  │ • 标签        │  │  │ - 关键信息          │  │   │
│  │              │  │  │ - 时间/来源         │  │   │
│  │ [筛选器]      │  │  └────────────────────┘  │   │
│  │ • 时间范围    │  │                          │   │
│  │ • 消息类型    │  │  点击卡片 → 展开对话上下文 │   │
│  │ • 重要性      │  │                          │   │
│  └──────────────┘  └──────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

### 6.2 核心页面/视图

1. **搜索视图**（默认首页）
   - 中心是搜索框，支持关键词、自然语言查询
   - 搜索结果以卡片形式展示（类似 Gmail 的邮件列表）
   - 每个卡片显示：摘要、关键实体、时间、来源、重要性标签
   - 点击卡片展开完整对话上下文

2. **重要消息 Feed**
   - 按时间倒序展示所有标记为重要的消息
   - 支持按规则类型筛选（关注人、关键词、@我、AI 识别）
   - 未读/已读状态

3. **话题视图**
   - 展示时段主题（window topics），后续可在其上聚合成长寿主题
   - 每个话题显示：标题、消息数量、时间跨度、参与人
   - 点击进入话题详情，查看相关消息

4. **对话浏览**（保留但降级）
   - 类似现在的聊天界面，但作为次要功能
   - 从联系人/群组列表进入，查看完整对话历史
   - 发送消息的入口在这里（应急功能）

### 6.3 状态管理变化

```typescript
// 旧的 chatStore（聊天客户端思维）
{
  selectedConversationId: string
  messages: Message[]
  isAtBottom: boolean
}

// 新的 knowledgeStore（知识库思维）
{
  searchQuery: string
  searchResults: SearchResult[]
  filters: {
    timeRange: [Date, Date]
    contacts: string[]
    importance: boolean
    tags: string[]
  }
  selectedMessage: Message | null
  highlightedTopics: Topic[]
}
```

### 6.4 技术栈调整

- **保留**：React + Vite + TanStack Query + Zustand
- **新增**：虚拟滚动（react-window）处理大量搜索结果
- **移除**：MessageInput 的复杂逻辑、ImageInput、乐观更新

---

## 七、减法执行清单

### 7.1 移除

| 文件/模块 | 原因 |
|-----------|------|
| `services/emojiService.ts` | 表情包下载不再需要 |
| `services/emojiDownloadQueue.ts` | 同上 |
| 前端 `EmojiMessage.tsx` | 表情包展示简化为占位符 |
| 前端 `ImageInput.tsx` | 图片发送移除 |
| Prisma `EmojiCache` 模型 | 不再需要 |
| `index.ts` 中 EmojiService 相关代码 | 依赖注入清理 |

**注意：OssService 保留**，因为 FileService 依赖它来存储文件。只移除表情包相关的使用。

### 7.2 简化

| 模块 | 变化 |
|------|------|
| WebSocket | 只保留 `message:new` 和 `highlight:new` 两个事件 |
| 消息发送 | 移除乐观更新逻辑，简化为同步发送 + 等待 webhook 回写 |
| 前端 MessageInput | 只保留纯文本输入框 |
| 前端路由 | 简化为：搜索页、Feed 页、话题页、对话页 |

### 7.3 保留不动

| 模块 | 原因 |
|------|------|
| DataLake | 核心存储 |
| MessageIndex | 元数据索引 |
| JuhexbotAdapter | webhook 接收是数据来源 |
| ContactSyncService | 联系人信息是搜索和筛选的基础 |
| ImageService | 图片查看仍然需要 |
| FileService | 文件访问仍然需要 |
| ArchiveService | 数据清理仍然需要 |
| DatabaseService | 数据库连接管理 |
| ConversationService | 会话管理 |
| DirectoryService | 通讯录管理 |
| OssService | FileService 依赖，文件存储需要 |

---

## 八、部署与资源管理

### 8.1 DuckDB 部署

DuckDB 是嵌入式数据库，无需独立部署：
- 通过 npm 安装 `duckdb` 包
- 在 Node.js 应用中直接使用
- 数据库文件存储在本地目录（如 `data/search.duckdb`）
- 加载 FTS 和 VSS 扩展：
  ```typescript
  import Database from 'duckdb'
  const db = new Database('data/search.duckdb')
  await db.exec('INSTALL fts; LOAD fts;')
  await db.exec('INSTALL vss; LOAD vss;')
  ```

### 8.2 资源预估

```
现有:
  Node.js (Hono)     ~150MB RAM
  SQLite              ~50MB RAM

新增:
  DuckDB              ~100MB RAM (按需加载)
  ONNX Runtime        ~200MB RAM (加载模型时)

总计: ~500MB RAM
```

**相比原方案（Meilisearch + lancedb）节省 ~200MB 内存**

### 8.3 降级策略

1. 放弃本地模型，AI 分析全部走云端 API（省内存，费钱）
2. 嵌入生成改为定时批量任务，不常驻内存（降到 ~300MB）
3. 如果 DuckDB 内存占用仍然过高，可以只保留 FTS，放弃向量搜索

### 8.4 历史数据迁移

现有 DataLake 中的消息需要回填到 DuckDB：
- 编写一次性迁移脚本，遍历 DataLake 中所有消息
- 批量写入 DuckDB FTS 表和 VSS 表
- 迁移脚本可重复执行（幂等），支持断点续传
- 迁移期间不影响新消息的正常接收和索引

迁移脚本示例：
```typescript
// 从 DataLake 读取所有消息
const messages = await dataLake.getAllMessages()

// 批量写入 DuckDB
for (const msg of messages) {
  // FTS 索引
  const tokens = jieba.cut(msg.content).join(' ')
  await db.run('INSERT INTO message_fts VALUES (?, ?, ?, ?, ?)', 
    [msg.msgId, tokens, msg.createTime, msg.fromUsername, msg.toUsername])
  
  // 向量索引
  const embedding = await generateEmbedding(msg.content)
  await db.run('INSERT INTO message_vectors VALUES (?, ?, ?)',
    [msg.msgId, embedding, msg.createTime])
}
```

### 8.5 异步处理队列

- 使用进程内内存队列（如 p-queue 或自实现），不引入 Redis/BullMQ 等外部依赖
- 队列持久化：将待处理任务 ID 写入 SQLite，进程重启后可恢复
- 并发控制：限制同时处理的任务数，避免资源争抢

---

## 九、API 设计

### 9.1 新增

```
GET  /api/search?q=&type=keyword|semantic|hybrid&from=&group=&after=&before=&important=&tags=&limit=&offset=
GET  /api/highlights?source=&unread=&limit=&offset=
GET  /api/topics?limit=&offset=
GET  /api/topics/:topicId/messages
POST /api/digest  { conversationId, startTime, endTime }
POST /api/extract { msgId }
GET  /api/rules
POST /api/rules   { type, value, priority }
PUT  /api/rules/:ruleId
DELETE /api/rules/:ruleId
```

### 9.2 保留

```
GET  /api/conversations
GET  /api/conversations/:id/messages
GET  /api/directory
POST /api/messages/send  (简化，仅文本)
GET  /api/images/:msgId
GET  /api/files/:msgId
```

### 9.3 移除

```
POST /api/messages/send-image
GET  /api/emoji/:msgId
```

---

## 十、测试策略

- **搜索引擎层**：集成测试，验证 DuckDB FTS 索引写入/查询和 VSS 向量搜索
- **知识处理管道**：规则引擎用单元测试覆盖；摘要生成、知识提炼、主题聚类分别验证幂等、降级和异步链路
- **前端**：保持现有组件测试模式，新增搜索和 Feed 视图测试
- **端到端**：消息从 webhook → 存储 → 索引 → 搜索返回，验证完整链路

---

## 十一、实施路线

### 阶段一：基础设施（搜索引擎层）
1. 集成 DuckDB + FTS/VSS 扩展
2. 实现 SearchService（统一搜索入口）
3. 实现中文分词管道（jieba-js 预分词 + DuckDB FTS）
4. 消息入库时同步写入 DuckDB FTS 索引
5. 实现关键词搜索 + 高级筛选 API
6. 实现向量嵌入生成（本地 ONNX 模型 + DuckDB VSS）
7. 实现语义搜索 API
8. 编写历史数据迁移脚本

### 阶段二：知识处理管道
1. 实现规则引擎（关注人、关键词、@我）
2. 新增数据模型（MessageTag、ImportanceRule 等）
3. 实现重要消息 Feed API
4. 实现异步处理队列
5. 集成本地 AI 模型（语义分类、实体提取）
6. 集成云端 LLM（窗口摘要 + 结构化知识提炼）
7. 实现基于 `KnowledgeCard` 的增量主题聚类与消息回填

### 阶段三：前端重构
1. 新建知识库布局（搜索中心）
2. 实现搜索视图、Feed 视图、话题视图
3. 简化对话浏览视图
4. 重构状态管理

### 阶段四：减法与优化
1. 移除 EmojiService 及相关代码
2. 简化 WebSocket 和消息发送
3. 性能和资源优化

---

**设计完成日期：** 2026-04-24
**下一步：** 编写实施计划
