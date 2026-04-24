# MoreChat 知识库重构设计

**日期：** 2026-04-24  
**状态：** 设计阶段  
**目标：** 将 MoreChat 从"微信 Web 客户端"重构为"微信消息知识库"

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
│  Meilisearch     │  规则引擎 + 本地AI + 云端AI   │
│  + 向量搜索       │                              │
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

## 三、搜索引擎层

搜索索引是 DataLake 的**派生层**——不是数据本身，而是数据的索引，可以随时从 DataLake 重建。

### 3.1 关键词搜索 — Meilisearch

- 独立的搜索引擎进程，监听 127.0.0.1:7700
- 内置 jieba 中文分词，开箱即用
- 消息入库时，从 DataLake 提取文本内容写入 Meilisearch 索引
- 索引是派生数据，可以随时从 DataLake 全量重建
- 部署：直接下载二进制，systemd 管理，`--max-indexing-memory 256MB`

### 3.2 高级筛选 — SQLite MessageIndex

- 基于现有 MessageIndex 的字段组合查询
- 筛选维度：时间范围、联系人/群组、消息类型、是否重要、标签
- 可以和关键词搜索组合使用

### 3.3 语义搜索 — 向量存储（lancedb）

- 本地嵌入模型（bge-small-zh，~50MB）生成消息文本的向量表示
- 使用 ONNX Runtime 在 Node.js 进程内运行
- 向量存储使用 lancedb（嵌入式，无需额外服务）
- 搜索时将查询文本转为向量，做余弦相似度匹配
- 处理"上周讨论的项目预算"这类自然语言查询

### 3.4 统一搜索入口

```
用户查询 "上周在XX群讨论的预算"
    │
    ▼
SearchService 解析查询
    │
    ├─ 结构化条件 → SQLite (群组=XX, 时间=上周)
    │                  → 返回符合条件的 msgId 集合 A
    │
    ├─ 关键词 "预算" → Meilisearch
    │                  → 返回匹配的 msgId 集合 B
    │
    └─ 语义向量 → lancedb
                   → 返回相似的 msgId 集合 C
    │
    ▼
合并 A ∩ (B ∪ C)，按相关性排序
    │
    ▼
从 DataLake 取完整消息内容返回
```

---

## 四、知识处理管道

### 4.1 实时处理（消息入库时同步执行，本地完成）

1. **规则引擎** — 基于用户配置的规则判断消息重要性
   - 关注人列表：消息来自关注的联系人/群组 → 标记重要
   - 关键词匹配：消息包含配置的关键词 → 标记重要
   - @我检测：群消息中 @了当前用户 → 标记重要
   - 零成本、零延迟，在 webhook 处理消息时同步执行

2. **Meilisearch 索引写入** — 消息文本同步写入全文索引

### 4.2 异步处理（后台队列，批量执行）

3. **向量嵌入生成** — 本地模型生成消息文本的 embedding，写入 lancedb
4. **语义重要性分析** — 本地小模型对未被规则命中的消息做轻量分类（是否包含待办、决策、问题等）
5. **实体提取** — 本地模型提取人名、项目名、日期、金额等结构化信息
6. **摘要生成（云端）** — 对标记为重要的消息所在的对话段落，调用云端 LLM 生成摘要
7. **主题聚类** — 定时任务，基于向量相似度将相关消息归类到话题下

### 4.3 手动触发

- 用户选中任意对话/时间段，点击"生成摘要" → 调用云端 LLM
- 用户选中消息，点击"提取信息" → 调用云端 LLM 做深度分析

### 4.4 处理流程

```
消息到达 (webhook)
    │
    ├─ 同步 ─→ 存储 (DataLake + MessageIndex)
    ├─ 同步 ─→ 规则引擎 (关注人/关键词/@我) → MessageTag
    ├─ 同步 ─→ Meilisearch 索引写入
    │
    └─ 入队 ─→ 异步处理队列
                 ├─→ 向量嵌入生成 → MessageEmbedding
                 ├─→ 语义分类 (本地) → MessageTag
                 ├─→ 实体提取 (本地) → MessageEntity
                 └─→ 摘要生成 (云端, 仅重要消息) → DigestEntry

定时任务 ─→ 主题聚类 → Topic + TopicMessage
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
  createdAt      DateTime @default(now())

  @@index([conversationId])
  @@index([startTime])
}

// 话题
model Topic {
  id          String   @id @default(cuid())
  title       String
  description String?
  messageCount Int     @default(0)
  firstSeenAt  Int
  lastSeenAt   Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  messages TopicMessage[]

  @@index([lastSeenAt])
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

- **Meilisearch 索引** — 消息全文索引，派生数据
- **lancedb 向量存储** — 消息嵌入向量，派生数据
- 两者均可从 DataLake 重建

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
   - 展示 AI 聚类出的话题
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

### 8.1 Meilisearch 部署

```bash
# 下载二进制
wget https://github.com/meilisearch/meilisearch/releases/latest/download/meilisearch-linux-amd64
chmod +x meilisearch-linux-amd64
sudo mv meilisearch-linux-amd64 /usr/local/bin/meilisearch

# systemd 服务
# 监听 127.0.0.1:7700，限制内存 256MB
```

### 8.2 资源预估

```
现有:
  Node.js (Hono)     ~150MB RAM
  SQLite              ~50MB RAM

新增:
  Meilisearch         ~256MB RAM (限制后)
  ONNX Runtime        ~200MB RAM (加载模型时)
  lancedb             ~50MB RAM

总计: ~700MB RAM
```

### 8.3 降级策略

1. 放弃本地模型，AI 分析全部走云端 API（省内存，费钱）
2. 嵌入生成改为定时批量任务，不常驻内存
3. Meilisearch 内存进一步限制到 128MB

### 8.4 历史数据迁移

现有 DataLake 中的消息需要回填到 Meilisearch 和 lancedb：
- 编写一次性迁移脚本，遍历 DataLake 中所有消息
- 批量写入 Meilisearch 索引和 lancedb 向量存储
- 迁移脚本可重复执行（幂等），支持断点续传
- 迁移期间不影响新消息的正常接收和索引

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

- **搜索引擎层**：集成测试，验证 Meilisearch 索引写入和查询
- **知识处理管道**：规则引擎用单元测试覆盖，AI 部分用 mock 测试接口契约
- **前端**：保持现有组件测试模式，新增搜索和 Feed 视图测试
- **端到端**：消息从 webhook → 存储 → 索引 → 搜索返回，验证完整链路

---

## 十一、实施路线

### 阶段一：基础设施（搜索引擎层）
1. 部署 Meilisearch
2. 实现 SearchService
3. 消息入库时同步写入 Meilisearch 索引
4. 实现关键词搜索 + 高级筛选 API
5. 实现向量嵌入生成（本地模型 + lancedb）
6. 实现语义搜索 API

### 阶段二：知识处理管道
1. 实现规则引擎（关注人、关键词、@我）
2. 新增数据模型（MessageTag、ImportanceRule 等）
3. 实现重要消息 Feed API
4. 实现异步处理队列
5. 集成本地 AI 模型（语义分类、实体提取）
6. 集成云端 LLM（摘要生成）
7. 实现主题聚类

### 阶段三：前端重构
1. 新建知识库布局（搜索中心）
2. 实现搜索视图、Feed 视图、话题视图
3. 简化对话浏览视图
4. 重构状态管理

### 阶段四：减法与优化
1. 移除 EmojiService、OssService 及相关代码
2. 简化 WebSocket 和消息发送
3. 性能和资源优化

---

**设计完成日期：** 2026-04-24
**下一步：** 编写实施计划
