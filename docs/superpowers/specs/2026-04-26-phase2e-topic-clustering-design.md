# 阶段 2E：主题聚类设计

## 概述

阶段 2E 的目标是把 MoreChat 在阶段 2D 生成的 `DigestEntry + KnowledgeCard` 进一步组织成可消费的话题结构。

本阶段采用混合两层方案：

- 第一层真实实现的是**时段主题**，即近期一组相近 `KnowledgeCard` 构成的讨论簇
- 第二层**长寿主题**只在模型边界和服务职责上预留接口，不在 2E 第一版真正实现

第一版的聚类输入单元不是原始消息，而是 `KnowledgeCard`。聚类完成后，再把对应摘要窗口里的消息回填到 `TopicMessage`，以保留回溯能力。

## 设计目标

1. 以 `KnowledgeCard` 为主输入实现稳定的主题聚类
2. 以“时段主题”作为 2E 第一版真实产物
3. 支持事件驱动增量归类，并用定时任务做修正
4. 允许一张 `KnowledgeCard` 归属最多 2-3 个 `Topic`
5. 保留后续把多个时段主题汇总成长寿主题的扩展空间

## 非目标

- 不在 2E 第一版实现长寿主题的真正聚合
- 不做图谱化知识组织
- 不引入独立向量数据库或额外后台系统
- 不做复杂重试基础设施
- 不做完整主题前端体验设计

## 当前基础

当前系统已经具备 2E 的前置条件：

- `EmbeddingService` 和 `message_vectors` 已可为文本提供向量表示
- `DigestEntry` 已可稳定表示一个消息窗口的摘要结果
- `KnowledgeCard` 已可稳定表示结构化知识结果
- `Topic` / `TopicMessage` 模型已存在，但尚未被实际使用

当前缺口主要有四个：

1. 还没有定义“Topic 在第一版里到底是什么”
2. 还没有定义聚类输入的粒度与候选范围
3. 还没有把 `KnowledgeCard` 和 `Topic` 建立正式成员关系
4. 还没有把 `Topic` 和原始消息回填链路打通

## 领域模型

### 1. KnowledgeCard

`KnowledgeCard` 继续作为 2E 的聚类输入单元。

原因：

- 相比消息级输入，`KnowledgeCard` 已经过摘要和结构化提炼，噪声显著更低
- 相比 `DigestEntry`，`KnowledgeCard` 的 `title / summary / decisions / actionItems` 更适合作为主题表达
- 计算成本和聚类稳定性都优于直接以消息为单位处理

### 2. Topic

2E 第一版里的 `Topic` 明确表示**时段主题**，不是最终的长期知识主题。

它回答的是：

> “近期这几张 `KnowledgeCard` 实际上是否在谈同一件事？”

因此第一版 `Topic` 的本质是“近期讨论簇”，而不是永久存在的知识分类。

建议扩展字段：

- `kind`: 第一版固定为 `window`
- `status`: `active | merged | stale`
- `title`
- `summary`
- `description`
- `keywords`
- `messageCount`
- `participantCount`
- `sourceCardCount`
- `clusterKey`
- `firstSeenAt`
- `lastSeenAt`
- `createdAt`
- `updatedAt`

语义约束：

- `Topic` 会随着新 `KnowledgeCard` 并入而持续更新
- 第一版只要求维护近期有效的时段主题
- 后续如果要演进到长寿主题，应新增上层聚合逻辑，而不是改变这里的定义

### 3. TopicKnowledgeCard

现有 `TopicMessage` 不足以表达“某张知识卡属于哪些主题”，因此需要新增一张显式成员关系表。

建议新增：

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

职责：

- 记录一张 `KnowledgeCard` 被归入哪些 `Topic`
- 记录归类得分 `score`
- 记录该归属在该卡上的排序 `rank`

### 4. TopicMessage

`TopicMessage` 在 2E 第一版里不是聚类输入，而是**回填结果**。

聚类流程应先完成：

- `KnowledgeCard -> TopicKnowledgeCard`

再做：

- `DigestEntry window -> TopicMessage`

这样 `TopicMessage` 的职责是：

- 支撑后续话题详情页查看原始消息上下文
- 支撑从 Topic 反查消息，而不是反向承担聚类成员关系

## 第一版与后续演进边界

### 2E 第一版真实实现

- 时段主题 `Topic(kind=window)`
- `TopicKnowledgeCard`
- `TopicMessage` 回填
- 事件驱动增量聚类
- 定时修正任务

### 后续预留但不实现

- 长寿主题聚合
- 多层话题树
- 跨周期主题演化追踪
- 主题版本管理

## 触发策略

### 事件驱动主流程

事件驱动是 2E 的主路径。

当 `KnowledgeCard` 生成或更新后：

1. 入队 `topic-clustering`
2. 读取该 `KnowledgeCard`
3. 选择近期候选 `Topic`
4. 计算与候选主题的相似度
5. 决定并入已有主题或创建新主题
6. 写入 `TopicKnowledgeCard`
7. 把对应摘要窗口里的消息回填到 `TopicMessage`

### 定时修正流程

定时任务用于修正增量阶段的误差，而不是替代增量流程。

定时修正只处理近期 `Topic` 和 `KnowledgeCard`，职责包括：

- 修复误分裂的相似 Topic
- 修复误归类的弱关联卡片
- 清理长期不活跃的 Topic
- 重新计算近期 Topic 的摘要字段和关键词

### 手动触发

2E 第一版不以手动聚类为主，但实现上应允许后续新增：

- 对某个 `KnowledgeCard` 重跑聚类
- 对某个 `Topic` 手动修正成员

## 聚类输入与候选范围

### 聚类输入文本

每张 `KnowledgeCard` 的聚类输入建议由以下字段拼接：

- `title`
- `summary`
- `decisions`
- `actionItems`

不强依赖：

- `risks`
- `participants`
- `timeAnchors`

原因：

- 前四项最能表达“在谈什么”
- 后三项更适合在排序和展示中作为辅助信息

### 候选 Topic 范围

增量归类时不扫描全库，只在近期 `active` 主题中选候选。

建议候选范围约束：

- 只看 `status = active`
- 只看最近一段时间内更新过的 `Topic`
- 候选数上限固定，避免单次归类扫描过大集合

这样可以在不引入额外存储系统的前提下，把增量成本控制在可接受范围内。

## 归属策略

### 单卡多主题归属

每张 `KnowledgeCard`：

- 至少归入 1 个主 `Topic`
- 最多归入 3 个 `Topic`

### 相似度判断

建议使用两级阈值：

- 主阈值：决定是否能成为第 1 个 Topic
- 次阈值：决定是否允许附加到第 2、第 3 个 Topic

如果多个候选 Topic 都只是弱命中，则优先创建新的时段主题，而不是强行塞入旧 Topic。

### 新建 Topic 条件

以下情况应新建 `Topic`：

- 没有候选 Topic 超过主阈值
- 候选 Topic 语义边界明显不清晰
- 现有候选 Topic 已经过于宽泛，继续吸纳会恶化可解释性

## 服务拆分

### TopicCandidateService

职责：

- 从 `KnowledgeCard` 构建聚类输入文本
- 调用现有 `EmbeddingService` 生成候选向量
- 输出供 `TopicClusteringService` 使用的候选表达

第一版不新增模型，直接复用当前 embedding 能力。

### TopicClusteringService

职责：

- 读取待归类 `KnowledgeCard`
- 选择候选 `Topic`
- 计算相似度
- 决定并入或新建
- 维护 `TopicKnowledgeCard`
- 更新 `Topic` 的聚合字段

这是 2E 第一版的核心领域服务。

### TopicBackfillService

职责：

- 根据 `KnowledgeCard -> DigestEntry` 找到对应摘要窗口
- 读取该窗口内的消息 `msgId`
- 幂等写入 `TopicMessage`

它只负责消息回填，不负责聚类决策。

### TopicRepairService

职责：

- 周期性扫描近期 `Topic`
- 重新评估弱关联成员
- 合并或标记异常主题

第一版可以保持保守实现，只处理近期数据。

### LongLivedTopicAggregator（预留）

职责预留：

- 把多个时段 `Topic` 汇总成长寿主题

第一版不实现该服务，但应避免把 `TopicClusteringService` 设计成只能支持单层结构。

## 数据模型变更建议

### 修改 Topic

建议新增字段：

- `kind`
- `status`
- `summary`
- `keywords`
- `participantCount`
- `sourceCardCount`
- `clusterKey`

并保留：

- `title`
- `description`
- `messageCount`
- `firstSeenAt`
- `lastSeenAt`

### 新增 TopicKnowledgeCard

建议新增显式成员关系模型 `TopicKnowledgeCard`。

### 保留 TopicMessage

`TopicMessage` 继续保留，但语义调整为“话题覆盖的原始消息集合”。

## 错误处理与降级

### 总体原则

- 主题聚类失败不能影响 `KnowledgeCard` 生成成功
- 所有自动聚类都必须异步执行
- embedding 不可用时必须优雅关闭自动聚类能力

### 增量聚类失败

如果单次 `KnowledgeCard` 归类失败：

- 记录日志
- 保留后续修正机会
- 不回滚 `DigestEntry` / `KnowledgeCard`

### 消息回填失败

如果 `Topic` 已归类成功但 `TopicMessage` 回填失败：

- 不回滚 `Topic` 和 `TopicKnowledgeCard`
- 后续由修正任务补齐

### Embedding 不可用

如果本地 embedding 不可用：

- 主服务照常启动
- 自动聚类能力关闭
- 手动或定时补跑能力可在后续实现

## 资源控制

2E 第一版延续保守资源策略：

- 不做全量消息聚类
- 聚类输入只用 `KnowledgeCard`
- 增量阶段只看近期候选 Topic
- 定时修正只扫描近时间窗口
- 不新增外部基础设施

## API 设计边界

根据总设计，后续应支持：

```http
GET /api/topics?limit=&offset=
GET /api/topics/:topicId/messages
```

但 2E 第一版是否同时交付查询 API，可以在 implementation plan 中决定。

如果本阶段同时交付最小查询 API，建议只做：

- `GET /api/topics`
- `GET /api/topics/:topicId/messages`

且返回的数据模型围绕“时段主题”组织，不提前暴露长寿主题语义。

## 测试策略

### TopicCandidateService 单测

- 文本拼接稳定
- 空字段兼容
- 输出可用于 embedding

### TopicClusteringService 单测

- 命中已有 Topic
- 创建新 Topic
- 一张卡最多归入 3 个 Topic
- 更新 `sourceCardCount / firstSeenAt / lastSeenAt`

### TopicBackfillService 单测

- 从 `DigestEntry` 找回消息窗口
- 幂等写入 `TopicMessage`

### 队列与修正任务集成测试

- `KnowledgeCard -> topic-clustering`
- 聚类失败软降级
- 定时修正仅处理近期 Topic

## 实现边界

阶段 2E 第一版包含：

- 扩展 `Topic` 模型
- 新增 `TopicKnowledgeCard`
- 新增 `TopicCandidateService`
- 新增 `TopicClusteringService`
- 新增 `TopicBackfillService`
- 打通 `KnowledgeCard` 生成后的 `topic-clustering` 异步链路
- 增加近期 Topic 修正任务

阶段 2E 第一版不包含：

- 真正的长寿主题聚合
- 多层 Topic 树
- 图谱化组织
- 复杂重试系统
- 完整前端主题体验

## 文件影响范围

预计影响文件：

- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/*`
- `apps/server/src/services/knowledgeQueue.ts`
- `apps/server/src/index.ts`
- `apps/server/src/services/digestWorkflowService.ts`

预计新增文件：

- `apps/server/src/services/topicCandidateService.ts`
- `apps/server/src/services/topicCandidateService.test.ts`
- `apps/server/src/services/topicClusteringService.ts`
- `apps/server/src/services/topicClusteringService.test.ts`
- `apps/server/src/services/topicBackfillService.ts`
- `apps/server/src/services/topicBackfillService.test.ts`
- `apps/server/src/services/topicRepairService.ts`
- `apps/server/src/services/topicRepairService.test.ts`

## 推荐实施顺序

1. 先扩展 `Topic` 模型并新增 `TopicKnowledgeCard`
2. 实现 `TopicCandidateService` 和 `TopicClusteringService`
3. 再实现 `TopicBackfillService`
4. 打通 `KnowledgeCard -> topic-clustering` 异步链路
5. 最后补近期修正任务和最小查询 API（若纳入本阶段）
