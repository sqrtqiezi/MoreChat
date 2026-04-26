# 阶段 2D：摘要生成与知识提炼设计

## 概述

阶段 2D 的目标是把 MoreChat 现有的摘要能力升级成知识库正式能力，同时覆盖两类入口：

1. 自动摘要：重要消息触发
2. 手动摘要：用户指定会话与时间范围触发

本阶段采用双层模型：

- `DigestEntry` 作为底层消息窗口摘要，回答“这段会话里发生了什么”
- `KnowledgeCard` 作为上层结构化知识产物，沉淀可复用的信息字段

阶段 2D 第一版只做后端能力与结构化存储，不做独立 UI，不保留版本历史，不引入复杂重试系统。

## 设计目标

1. 统一自动摘要和手动摘要的领域模型与处理流水线
2. 保留 `DigestEntry` 作为可重建的窗口摘要层
3. 新增结构化知识提炼层，供后续搜索、Feed、摘要列表消费
4. 支持同一消息窗口重复生成时覆盖旧结果
5. 云端 LLM 失败时软降级，不阻塞消息主链路

## 非目标

- 不做知识卡片独立页面或详情页
- 不做摘要或知识卡片版本历史
- 不做复杂任务编排、重试策略或运行历史模型
- 不做主题聚类
- 不做图谱化知识建模

## 当前基础

当前系统已经具备阶段 2D 的基础实现：

- `DigestService` 已支持按时间范围生成摘要
- `/api/digest` 已支持手动触发摘要
- `important` 消息已可通过 `knowledgeQueue` 入队自动摘要

但当前实现仍然偏“功能试作”，存在三个边界问题：

1. `DigestEntry` 仍然只是文本摘要记录，缺少状态、来源、覆盖更新语义
2. 自动摘要与手动摘要共用实现，但没有被建模成统一领域概念
3. 摘要结果没有进入上层结构化知识层，无法稳定供知识库视图消费

## 领域模型

### 1. DigestEntry

`DigestEntry` 表示某个会话在某个时间窗口内的一次摘要结果，是底层的可重建中间产物。

职责：

- 记录会话窗口范围
- 记录窗口内消息数量
- 保存 LLM 生成的窗口摘要
- 记录摘要状态、来源与错误
- 作为 `KnowledgeCard` 的上游输入

建议字段：

- `id`
- `conversationId`
- `startTime`
- `endTime`
- `summary`
- `messageCount`
- `sourceKind`: `auto | manual`
- `triggerMsgId`: 自动摘要时记录锚点消息，手动摘要为空
- `status`: `pending | ready | failed`
- `errorMessage`
- `createdAt`
- `updatedAt`

语义约束：

- 同一窗口允许重复生成
- 重复生成时覆盖原记录，而不是保留旧版本
- 自动摘要与手动摘要均通过同一模型表达，仅由 `sourceKind` 区分入口

### 2. KnowledgeCard

`KnowledgeCard` 表示从 `DigestEntry` 提炼出的结构化知识结果，是面向知识库消费层的稳定产物。

职责：

- 为搜索、重要信息流、摘要列表提供结构化信息
- 让后续前端无需反复读取原始消息和摘要全文
- 为后续主题聚类、知识聚合提供可复用输入

建议字段：

- `id`
- `digestEntryId`
- `conversationId`
- `title`
- `summary`
- `decisions`
- `actionItems`
- `risks`
- `participants`
- `timeAnchors`
- `createdAt`
- `updatedAt`

初版存储策略：

- `decisions`
- `actionItems`
- `risks`
- `participants`
- `timeAnchors`

以上字段初版使用 JSON 字符串或 Prisma JSON 类型存储，不提前拆成独立关系表。

## 触发策略

### 自动触发

自动摘要只在消息被标记为 `important` 时触发，继续保持保守策略。

触发路径：

1. 消息入库
2. 规则引擎或语义重要性分析产出 `important`
3. `knowledgeQueue` 入队 `digest-generation`
4. 生成或更新 `DigestEntry`
5. 基于 `DigestEntry` 生成或更新 `KnowledgeCard`

### 手动触发

手动摘要由 `/api/digest` 触发，输入：

- `conversationId`
- `startTime`
- `endTime`

处理路径与自动摘要保持一致，只是入口不同：

1. 请求进入摘要 API
2. 生成或更新 `DigestEntry`
3. 成功后触发知识提炼
4. 生成或更新 `KnowledgeCard`

## 统一处理流水线

### 自动入口

1. 重要消息入队 `digest-generation`
2. 根据锚点消息定位会话与时间窗口
3. 拉取窗口内消息，生成窗口摘要
4. 对 `DigestEntry` 做幂等 upsert
5. 基于摘要结果提炼结构化知识
6. 对 `KnowledgeCard` 做幂等 upsert

### 手动入口

1. 用户指定会话和时间范围
2. 拉取窗口内消息，生成窗口摘要
3. 对 `DigestEntry` 做幂等 upsert
4. 基于摘要结果提炼结构化知识
5. 对 `KnowledgeCard` 做幂等 upsert

自动与手动的区别只存在于入口参数，不存在两套独立领域服务。

## 覆盖与幂等策略

阶段 2D 明确采用“覆盖旧结果”的策略。

### DigestEntry

推荐唯一语义：

- `conversationId + startTime + endTime + sourceKind`

同一窗口再次生成时：

- 更新 `summary`
- 更新 `messageCount`
- 更新 `status`
- 更新 `errorMessage`
- 更新 `updatedAt`

自动摘要默认覆盖旧结果，不保留第一版。

### KnowledgeCard

`KnowledgeCard` 跟随 `DigestEntry` 覆盖更新。

推荐唯一语义：

- `digestEntryId`

如果同一个 `DigestEntry` 被重新生成，则对应 `KnowledgeCard` 直接覆盖，不保留历史版本。

## 服务拆分

### DigestWindowService

职责：

- 按会话和时间范围拉取消息窗口
- 过滤撤回消息与空内容
- 处理非文本消息占位符
- 裁剪超长消息
- 产出稳定的摘要输入文本

拆分原因：

- 把“消息窗口构建”从 `DigestService` 中分离
- 便于独立测试窗口边界和文本裁剪逻辑

### DigestService

职责：

- 调用云端 LLM 生成窗口摘要
- 管理 `DigestEntry` 的创建、覆盖更新和失败状态
- 统一自动摘要和手动摘要入口

约束：

- 不直接负责结构化知识提炼
- 不直接暴露复杂任务状态模型

### KnowledgeExtractionService

职责：

- 基于 `DigestEntry` 的摘要文本和必要上下文提炼结构化字段
- 产出 `title`
- 提取 `decisions`
- 提取 `actionItems`
- 提取 `risks`
- 提取 `participants`
- 提取 `timeAnchors`
- 对 `KnowledgeCard` 做幂等 upsert

约束：

- 不直接读取整段原始消息作为主输入，优先消费 `DigestEntry`
- 提炼失败不能回滚已成功生成的 `DigestEntry`

## 错误处理与降级

### 总体原则

- 消息主链路不能等待摘要或知识提炼完成
- 所有自动能力必须异步执行
- 云端依赖失败时必须软失败

### 自动摘要失败

如果自动摘要失败：

- `DigestEntry.status = failed`
- 记录 `errorMessage`
- 不阻塞消息入库
- 不触发失败风暴式重试

### 手动摘要失败

如果手动摘要失败：

- API 返回明确失败
- 同时持久化失败状态，便于后续人工重跑

### 知识提炼失败

如果 `DigestEntry` 已成功但知识提炼失败：

- `DigestEntry` 保持 `ready`
- `KnowledgeCard` 标记失败或不写入
- 不回滚摘要结果

### LLM 不可用

如果 LLM 配置缺失或调用失败：

- 自动摘要能力优雅关闭或软失败
- 手动摘要明确返回服务不可用
- 服务主进程仍正常启动

## 资源控制

阶段 2D 维持保守资源策略：

- 自动摘要仅处理 `important` 消息
- 单窗口消息数设置硬上限
- 单条消息最大字符数设置硬上限
- 总 prompt 长度受控
- 非文本消息统一用占位符，不在 2D 做复杂多模态摘要

## API 设计调整

现有 `/api/digest` 继续保留，但语义从“仅生成摘要”升级为：

- 生成或更新 `DigestEntry`
- 触发对应的结构化知识提炼

返回值建议至少包含：

- `digestEntry`
- `knowledgeCard` 是否成功生成
- 若知识提炼异步执行，则返回受理状态

阶段 2D 第一版可以先保持当前 API 形态不变，只在服务内补齐知识提炼链路；如果这样做，后续需要补一个查询摘要与知识卡片结果的 API。

## 数据库变更建议

### 修改 DigestEntry

新增字段：

- `sourceKind`
- `triggerMsgId`
- `status`
- `errorMessage`
- `updatedAt`

并补充唯一索引，支撑窗口级 upsert。

### 新增 KnowledgeCard

新增模型 `KnowledgeCard`，至少包含：

- `digestEntryId`
- `conversationId`
- `title`
- `summary`
- `decisions`
- `actionItems`
- `risks`
- `participants`
- `timeAnchors`
- `createdAt`
- `updatedAt`

并以 `digestEntryId` 建立唯一约束。

## 测试策略

### DigestWindowService 单测

- 正确拉取时间窗口消息
- 过滤撤回消息
- 非文本消息占位正确
- 超长文本截断正确
- 空窗口与小窗口边界正确

### DigestService 单测

- 自动与手动共享同一摘要生成逻辑
- `DigestEntry` upsert 正确
- 同一窗口重复生成时覆盖更新
- LLM 失败时记录失败状态

### KnowledgeExtractionService 单测

- 能从摘要文本提取结构化字段
- 空字段兼容
- 覆盖更新正确
- 提炼失败不影响 `DigestEntry`

### API 与队列集成测试

- `/api/digest` 手动触发成功
- `important -> digest-generation -> knowledge extraction` 流程贯通
- LLM 未配置时自动能力优雅降级

## 实现边界

阶段 2D 第一版包含：

- 把现有摘要能力升级为正式 `DigestEntry` 领域模型
- 新增 `KnowledgeCard` 模型
- 新增 `DigestWindowService`
- 新增 `KnowledgeExtractionService`
- 自动和手动摘要统一走摘要 + 知识提炼流水线
- 补齐失败留痕与覆盖更新能力
- 补齐单测和集成测试

阶段 2D 第一版不包含：

- 知识卡片独立 UI
- 多版本历史
- 复杂重试系统
- 主题聚类
- 图谱化知识组织

## 文件影响范围

预计影响文件：

- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/*`
- `apps/server/src/services/digestService.ts`
- `apps/server/src/services/digestService.test.ts`
- `apps/server/src/services/knowledgeQueue.ts`
- `apps/server/src/services/message.ts`
- `apps/server/src/index.ts`
- `apps/server/src/routes/digest.ts`
- `apps/server/src/routes/digest.test.ts`

预计新增文件：

- `apps/server/src/services/digestWindowService.ts`
- `apps/server/src/services/digestWindowService.test.ts`
- `apps/server/src/services/knowledgeExtractionService.ts`
- `apps/server/src/services/knowledgeExtractionService.test.ts`

## 推荐实施顺序

1. 先扩展 Prisma 模型，正式定义 `DigestEntry` 与 `KnowledgeCard`
2. 把消息窗口构建逻辑从 `DigestService` 中拆到 `DigestWindowService`
3. 重构 `DigestService` 为窗口摘要 upsert 服务
4. 新增 `KnowledgeExtractionService`
5. 打通 `digest-generation` handler 和 `/api/digest`
6. 最后补齐失败留痕、幂等覆盖和测试
