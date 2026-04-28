# 阶段 3B：重要消息 Feed、话题列表与知识侧栏增强设计

**日期：** 2026-04-28  
**状态：** 设计完成，待评审  
**目标：** 在 Phase 3a 的知识库搜索首页基础上，补齐重要消息 Feed、话题列表与话题详情页，并把知识侧栏升级为真实导航与轻量预览入口。

---

## 一、背景

Phase 3a 已完成以下能力：

- Web 默认入口切换到知识库搜索页 `/`
- 搜索页已接入 `/api/search`
- 聊天页保留为 `/chat`，并支持通过 `conversationId` 查询参数定位原始会话
- 知识库布局、搜索控件、搜索结果卡片已落地

当前剩余问题：

- 知识侧栏仍是静态占位，无法真正导航
- 重要消息还没有独立 Feed 视图
- 话题只有后端列表接口，没有前端列表和详情入口
- 用户仍然只能通过搜索消费知识，缺少“被动浏览重要信息”和“按主题浏览”的入口

Phase 3b 的目标是把知识库扩展为三类平级入口：

1. 搜索：主动检索历史消息
2. Feed：被动浏览重要消息与摘要
3. Topics：按话题浏览已经聚合出的主题

---

## 二、范围

### 本阶段包含

1. 新增 `/feed` 重要消息 Feed 页面
2. 新增 `/topics` 话题时间线列表页面
3. 新增 `/topics/:topicId` 话题详情页面
4. 知识侧栏升级为真实路由导航
5. 侧边栏增加轻量预览区（最近 topics、重要消息提示）
6. 后端新增 `/api/highlights` 路由，供 Feed 页面消费
7. 前端新增 highlights 和 topic detail 的 API/hooks/组件/测试

### 本阶段不包含

1. 不做 Feed 已读/未读状态
2. 不做复杂筛选器下沉到侧边栏
3. 不做搜索结果与话题详情的上下文联动
4. 不做话题编辑、合并、关闭等管理能力
5. 不做知识卡片独立详情页
6. 不删除旧聊天组件与消息发送能力

---

## 三、信息架构与路由

Phase 3b 将知识库扩展为以下路由结构：

- `/`：搜索页，保持 Phase 3a 现状
- `/feed`：重要消息 Feed
- `/topics`：话题时间线列表
- `/topics/:topicId`：话题详情页
- `/chat`：原始对话浏览页

设计原则：

- 搜索、Feed、Topics 是三种平级知识消费视图，不做单页 tab 切换
- 每个知识视图都应该有独立 URL，支持刷新、分享、浏览器返回
- `/chat` 继续作为“查看原始上下文”的次级出口，而不是知识库主入口
- 话题既然是稳定知识对象，就应当有自己的详情页，而不是强制跳回搜索

### 知识侧栏职责

知识侧栏在本阶段只承担两类职责：

1. 全局导航
   - Search
   - Feed
   - Topics
   - Chat
2. 轻量预览
   - 最近 3 个 topics
   - 重要消息提示（总数或最近有新重要消息的文案）

侧边栏不承载主列表内容，不承载复杂筛选，不复用为页内 tab。

---

## 四、后端设计：`/api/highlights`

### 4.1 目标

新增独立的 highlights 路由，提供“重要消息 + 摘要/知识卡片”视图所需的数据，而不是复用 `/api/search`。

原因：

- Feed 的主排序是时间，而不是相关性
- Feed 不依赖关键词查询
- Feed 需要优先展示摘要/知识卡片，而搜索结果主要返回原始消息
- 复用搜索接口会导致前端后续再次改造

### 4.2 路由

```http
GET /api/highlights?limit=20&offset=0
```

请求参数：

- `limit`：分页大小，默认 20，最大 100
- `offset`：分页偏移，默认 0

### 4.3 返回结构

```ts
interface HighlightTag {
  tag: string
  source: string
}

interface HighlightDigest {
  id: string
  summary: string
  messageCount: number
  startTime: number
  endTime: number
}

interface HighlightKnowledgeCard {
  id: string
  title: string
  summary: string
  decisions: string
  actionItems: string
}

interface HighlightItem {
  msgId: string
  content: string
  createTime: number
  fromUsername: string
  toUsername: string
  conversationId: string
  tags: HighlightTag[]
  digest?: HighlightDigest
  knowledgeCard?: HighlightKnowledgeCard
}
```

返回包裹结构沿用现有 API 约定：

```ts
{
  success: true,
  data: {
    items: HighlightItem[],
    total: number,
    limit: number,
    offset: number,
  }
}
```

### 4.4 查询逻辑

1. 从 `MessageTag` 查询 `tag = 'important'` 的记录
2. 按 `createdAt desc` 排序并分页
3. 批量加载这些 `msgId` 对应的 `MessageIndex`
4. 对每条消息，根据 `conversationId` 和 `createTime` 匹配 `DigestEntry`
   - 条件：
     - `conversationId` 相同
     - `status = 'ready'`
     - `startTime <= message.createTime <= endTime`
5. 若匹配到 `DigestEntry`，再加载关联的 `KnowledgeCard`
6. 组装为 `HighlightItem[]`

### 4.5 匹配语义

- `digest` 是“尽力匹配”的增强信息，不是一对一强关联
- 一条重要消息只要落在某个摘要窗口中，就可以挂上该摘要
- 如果存在 `KnowledgeCard`，前端可进一步展示结构化摘要
- 若未匹配到 `digest` 或 `knowledgeCard`，消息仍然是有效 highlight，前端退化为原始消息卡片

### 4.6 错误处理

- 非法分页参数返回 400
- 查询异常返回 500
- 没有 highlights 返回空列表，不视为错误

### 4.7 注册方式

`app.ts` 中新增：

```ts
app.route('/api/highlights', highlightsRoutes({ db: deps.db }))
```

与 `topicsRoutes`、`entitiesRoutes` 同级，依赖 `DatabaseService`。

---

## 五、前端页面与组件设计

### 5.1 页面

新增页面：

- `FeedPage.tsx`
- `TopicsPage.tsx`
- `TopicDetailPage.tsx`

保留页面：

- `KnowledgePage.tsx`：搜索页
- `ChatPage.tsx`：原始会话页

### 5.2 组件边界

保留并扩展：

- `KnowledgeLayout.tsx`：知识库统一外壳
- `KnowledgeSidebar.tsx`：升级为真实导航 + 轻量预览
- `SearchResultCard.tsx`：继续只服务搜索结果，不强行兼容 Feed/Topic 场景

新增组件：

- `HighlightCard.tsx`
- `HighlightsList.tsx`
- `TopicCard.tsx`
- `TopicTimeline.tsx`
- `TopicMessageList.tsx`
- `KnowledgeSidebarPreview.tsx`

原则：

- 搜索、Feed、Topics 使用统一布局语言，但保留各自的卡片语义
- 不为了“复用”而把三种视图的差异硬塞进一个万能卡片组件

---

## 六、各视图展示规则

### 6.1 Feed 页：`/feed`

Feed 页展示重要消息时间流，按时间倒序排列。

每个 `HighlightCard` 的展示规则：

1. 若存在 `knowledgeCard`
   - 优先展示 `knowledgeCard.title`
   - 主摘要展示 `knowledgeCard.summary`
   - 可附带 `decisions` / `actionItems` 的精简块
2. 若无 `knowledgeCard` 但存在 `digest`
   - 展示 `digest.summary`
3. 若两者都不存在
   - 退化为原始消息卡片，直接展示消息正文

卡片底部统一保留锚点消息信息：

- 发送人
- 时间
- 原始消息片段
- “打开原始对话”按钮

交互约束：

- 本阶段不内联展开完整聊天上下文
- 本阶段不支持已读/未读标记
- 点击“打开原始对话”跳转到 `/chat?conversationId=...`

### 6.2 Topics 页：`/topics`

Topics 页采用单列时间线列表，而不是网格。

每张 `TopicCard` 展示：

- 话题标题
- 话题摘要
- 消息数
- 参与人数
- 最后活跃时间

交互：

- 点击整张卡片进入 `/topics/:topicId`

选择时间线列表而不是网格的原因：

- 与 Feed 页形成一致的浏览节奏
- topic 的摘要是主要信息，适合纵向阅读
- 移动端更自然，不需要复杂响应式折行逻辑

### 6.3 Topic 详情页：`/topics/:topicId`

顶部信息区展示：

- topic 标题
- topic 摘要
- 消息数
- 参与人数
- 最近活跃时间

下方展示该话题关联的消息列表，按时间升序排列。

消息列表由 `TopicMessageList` 渲染，展示方式接近知识卡片样式，而不是嵌入完整聊天窗口。原因：

- 话题详情是知识浏览，不是实时会话操作
- 嵌入聊天窗口会引入额外状态和视觉噪音
- 用户若要查看原始上下文，仍通过 `/chat` 跳转

空状态：

- 如果 topic 没有关联消息，显示明确的空状态文案，而不是报错

---

## 七、状态管理与数据流

本阶段遵循以下边界：

- URL 管理页面定位
- React Query 管理服务端数据
- Zustand 仅保留搜索页的交互状态

### 7.1 URL 状态

由 React Router 管理：

- 当前页面路由
- `topicId`
- `/chat` 的 `conversationId` 查询参数

这些状态不写入 `knowledgeStore`。

### 7.2 服务端状态

新增 query hooks：

```ts
useHighlights(limit = 20, offset = 0)
useTopicMessages(topicId: string)
useTopicsPreview()
```

已有：

```ts
useTopics(limit?)
```

建议 query key：

```ts
['highlights', limit, offset]
['topics', limit, offset]
['topic-messages', topicId]
['topics-preview']
```

### 7.3 Zustand 边界

`knowledgeStore` 继续只管理搜索页状态：

- `query`
- `mode`
- `filters`
- `selectedResultId`

不新增：

- `feedStore`
- `topicsStore`

Feed 和 Topics 页面的局部交互（例如展开、局部 hover、选中）用组件内部状态处理。

### 7.4 数据流示例

#### Feed

1. 用户进入 `/feed`
2. `FeedPage` 调用 `useHighlights()`
3. 前端请求 `/api/highlights`
4. 返回 `HighlightItem[]`
5. `HighlightsList` 渲染多个 `HighlightCard`
6. 每张卡片根据 `knowledgeCard` / `digest` / 原始消息做降级渲染
7. 点击“打开原始对话”跳转 `/chat?conversationId=...`

#### Topics

1. 用户进入 `/topics`
2. `TopicsPage` 调用 `useTopics()`
3. 渲染 `TopicTimeline`
4. 点击某个 topic 进入 `/topics/:topicId`

#### Topic 详情

1. `TopicDetailPage` 从路由参数读取 `topicId`
2. 调用 `useTopicMessages(topicId)`
3. 渲染 topic 头部和消息列表
4. 用户可从消息卡片跳原始对话

---

## 八、知识侧栏增强

### 8.1 导航

把当前静态按钮替换为真正的路由链接：

- Search → `/`
- Feed → `/feed`
- Topics → `/topics`
- Chat → `/chat`

要求：

- 当前路由高亮
- 桌面端保持 sticky
- 移动端仍可横向滚动

### 8.2 轻量预览

侧边栏底部增加 `KnowledgeSidebarPreview`：

- 最近 3 个 topics
- 重要消息提示（例如总数）

约束：

- 预览只做信息提醒，不做复杂分页
- 不把完整 Feed 或 Topics 列表塞进侧边栏
- 预览点击后直接导航到对应页面

这样可以让侧边栏看起来像知识库入口，而不只是一个按钮容器。

---

## 九、文件改动建议

### 新增文件

```text
apps/server/src/routes/highlights.ts
apps/server/src/routes/highlights.test.ts

apps/web/src/components/knowledge/HighlightCard.tsx
apps/web/src/components/knowledge/HighlightsList.tsx
apps/web/src/components/knowledge/TopicCard.tsx
apps/web/src/components/knowledge/TopicTimeline.tsx
apps/web/src/components/knowledge/TopicMessageList.tsx
apps/web/src/components/knowledge/KnowledgeSidebarPreview.tsx
apps/web/src/hooks/useHighlights.ts
apps/web/src/hooks/useTopicMessages.ts
apps/web/src/hooks/useTopicsPreview.ts
apps/web/src/pages/FeedPage.tsx
apps/web/src/pages/TopicsPage.tsx
apps/web/src/pages/TopicDetailPage.tsx
apps/web/src/pages/FeedPage.test.tsx
apps/web/src/pages/TopicsPage.test.tsx
apps/web/src/pages/TopicDetailPage.test.tsx
```

### 修改文件

```text
apps/server/src/app.ts
apps/web/src/App.tsx
apps/web/src/api/knowledge.ts
apps/web/src/components/knowledge/KnowledgeSidebar.tsx
apps/web/src/components/knowledge/KnowledgeLayout.tsx
apps/web/src/types/index.ts
```

---

## 十、类型建议

前端新增类型：

```ts
export interface HighlightTag {
  tag: string
  source: string
}

export interface HighlightDigest {
  id: string
  summary: string
  messageCount: number
  startTime: number
  endTime: number
}

export interface HighlightKnowledgeCard {
  id: string
  title: string
  summary: string
  decisions: string
  actionItems: string
}

export interface HighlightItem {
  msgId: string
  content: string
  createTime: number
  fromUsername: string
  toUsername: string
  conversationId: string
  tags: HighlightTag[]
  digest?: HighlightDigest
  knowledgeCard?: HighlightKnowledgeCard
}

export interface HighlightsResponse {
  items: HighlightItem[]
  total: number
  limit: number
  offset: number
}
```

Topic 详情页需要在前端显示 topic 头部信息，因此 `/api/topics/:topicId/messages` 需要调整返回结构：

```ts
{
  topic: TopicSummary,
  messages: TopicMessageItem[]
}
```

而不是只返回消息数组。因为详情页顶部需要展示 topic 元信息，一次请求返回完整资源更自然，避免前端再补一次 topic 查询。

**决策：本阶段将 `/api/topics/:topicId/messages` 从”只返回消息列表”调整为”返回 topic + messages”。**

---

## 十一、测试策略

### 11.1 后端测试

新增 `highlights.test.ts`，覆盖：

1. 能返回 important 消息分页结果
2. 能正确挂上 `digest`
3. 能正确挂上 `knowledgeCard`
4. 没有关联摘要时仍返回原始消息
5. 非法分页参数返回 400
6. 查询异常返回 500

`topics` 现有测试需要同步调整，覆盖 topic 详情接口的新返回结构。

### 11.2 前端测试

#### `FeedPage.test.tsx`

覆盖：

- 有 `knowledgeCard` 时优先渲染结构化摘要
- 只有 `digest` 时渲染摘要卡片
- 都没有时退化为原始消息卡片
- 点击“打开原始对话”跳转 `/chat?conversationId=...`

#### `TopicsPage.test.tsx`

覆盖：

- 渲染时间线列表
- 点击 topic 进入 `/topics/:topicId`

#### `TopicDetailPage.test.tsx`

覆盖：

- 渲染 topic 头部信息
- 渲染消息列表
- 空消息时显示空状态

#### `KnowledgeSidebar.test.tsx`

覆盖：

- 当前路由高亮
- 渲染最近 topics 预览
- Search / Feed / Topics / Chat 四个导航入口存在

### 11.3 回归验证

必须继续通过：

- `KnowledgePage.test.tsx`
- `knowledgeStore.test.ts`
- `ChatPage` 路由同步相关测试

### 11.4 人工验证

1. `/` 搜索页保持正常
2. `/feed` 能展示重要消息流
3. `/topics` 能展示话题时间线
4. `/topics/:topicId` 能展示详情与消息列表
5. 从 Feed / Topic 详情跳 `/chat` 能正确定位会话

---

## 十二、设计决策总结

本阶段确定如下决策：

1. Feed 视图优先展示摘要/知识卡片，无摘要时退化为原始消息
2. Search / Feed / Topics 使用独立路由，而不是单页 tab
3. Topics 使用单列时间线列表，而不是网格
4. 侧边栏承担导航 + 轻量预览，不承担复杂筛选
5. 本阶段实现 `/topics/:topicId` 详情页
6. 本阶段新增独立 `/api/highlights` 路由，不复用搜索接口
7. 本阶段不做已读/未读状态
8. 话题详情接口建议返回 `topic + messages`，减少前端二次请求

---

## 十三、后续衔接

Phase 3b 完成后，下一步优先顺序建议为：

1. Phase 3c：对话浏览降级、搜索结果上下文联动、手动摘要触发
2. Phase 4a：移除 Emoji / ImageInput / 发送乐观更新等减法清理
3. 后续单独阶段：Feed 已读/未读、更多筛选、知识卡片详情页

---

**设计完成日期：** 2026-04-28  
**下一步：** 基于本 spec 编写 Phase 3b 实施计划
