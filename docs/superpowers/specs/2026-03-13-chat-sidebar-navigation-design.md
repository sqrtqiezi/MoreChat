# Chat 页面侧边栏导航重构设计

## 背景

当前聊天页左侧仅支持单一会话列表，结构简单但能力不足：

- 无法在会话列表和联系人/群组目录之间切换
- 无法从联系人/群组目录直接打开或创建会话
- 无法折叠左侧边栏以给消息区更多空间

本次改动目标是为聊天页增加更清晰的导航层次，同时保持右侧消息区现有行为不变。

## 目标

在桌面端 Chat 页面实现以下能力：

1. 左侧边栏支持折叠为窄图标轨道
2. 左侧边栏底部增加模式切换，在 `会话` 和 `联系人/群组` 两个界面之间切换
3. 新增联系人/群组目录页，联系人和群组分组显示，支持折叠/展开
4. 点击联系人/群组时，若已有会话则直接进入；若无会话则创建后进入
5. 联系人/群组目录页支持前端本地搜索

## 非目标

- 不调整右侧消息列表、消息输入框、消息渲染逻辑
- 不为移动端新增独立抽屉式交互，本次以当前桌面布局为主
- 不为会话模式增加搜索
- 不引入联系人详情页、群组详情页或未读数扩展展示
- 不做远程搜索或分页，目录搜索仅过滤已加载数据

## 当前代码影响面

当前前端结构：

- [Sidebar.tsx](/Users/niujin/develop/MoreChat/apps/web/src/components/layout/Sidebar.tsx) 仅渲染 `ClientStatus` 和 `ConversationList`
- [ChatPage.tsx](/Users/niujin/develop/MoreChat/apps/web/src/pages/ChatPage.tsx) 使用 `selectedConversationId` 驱动右侧消息区
- [chatStore.ts](/Users/niujin/develop/MoreChat/apps/web/src/stores/chatStore.ts) 当前仅保存选中的会话 ID

当前后端能力：

- 已有 `GET /api/conversations`
- 已有按联系人 username / 群 roomUsername 查找或创建 Conversation 的底层数据库能力
- 尚无面向前端的联系人/群组目录接口
- 尚无“打开或创建会话”的显式 API

## 总体方案

采用单侧栏双模式设计：

1. 左侧固定保留一个窄轨道 `SidebarRail`
2. 轨道右侧是可切换内容面板 `SidebarPanel`
3. 展开状态下，`SidebarPanel` 根据当前模式显示：
   - `会话` 模式：现有会话列表
   - `联系人/群组` 模式：新目录页
4. 折叠状态下，仅保留窄轨道，不显示内容面板

推荐该方案的原因：

- 与“会话 / 联系人群组 两个不同界面”的需求完全一致
- 折叠后只剩 3 个图标，行为清晰
- 不需要让会话列表和联系人目录长期并存，避免导航焦点冲突

## UI 结构设计

### 1. SidebarRail

固定显示在最左侧，宽度约 56px。

包含 3 个按钮：

- 顶部：折叠/展开按钮
- 底部：`会话` 模式按钮
- 底部：`联系人/群组` 模式按钮

折叠状态要求：

- 仅显示图标，不显示文字
- 不显示内容面板
- 点击模式按钮只切换模式，不直接改变当前会话

### 2. SidebarPanel

仅在展开状态下显示，位于 `SidebarRail` 右侧，宽度保持当前 sidebar 主体尺寸（约 224px）。

根据 `sidebarMode` 渲染：

- `conversations` -> `ConversationListPanel`
- `directory` -> `DirectoryPanel`

### 3. ConversationListPanel

保留当前会话列表能力，不改变交互语义：

- 仍按现有 `/api/conversations` 数据渲染
- 点击会话项后更新 `selectedConversationId`
- 当前选中态的来源不变，仍是 `selectedConversationId`

### 4. DirectoryPanel

目录页新增以下结构：

- 顶部搜索框
- `联系人` 分组
- `群组` 分组

两个分组都支持折叠/展开，默认展开。

每个列表项展示基础信息：

- 联系人：头像、显示名（remark > nickname > username）
- 群组：头像、群名

## 前端状态设计

建议新增以下状态：

- `selectedConversationId: string | null`
- `isSidebarCollapsed: boolean`
- `sidebarMode: 'conversations' | 'directory'`
- `directoryQuery: string`
- `directoryExpanded: { contacts: boolean; groups: boolean }`

状态边界：

- `selectedConversationId` 继续保留在现有 chat store 中
- `isSidebarCollapsed` 和 `sidebarMode` 也适合放入 chat store，因为它们属于页面级导航状态
- `directoryQuery` 与 `directoryExpanded` 可放在 `DirectoryPanel` 本地状态，或收敛到 sidebar 相关 store；本次优先使用局部状态，避免全局状态膨胀
- 不新增“当前选中的联系人/群组”状态，目录点击的最终结果仍然是选择会话

## 数据模型与 API 设计

### 目录列表接口

新增接口：

`GET /api/directory`

返回结构建议：

```ts
{
  contacts: Array<{
    id: string
    username: string
    nickname: string
    remark: string | null
    avatar: string | null
    conversationId: string | null
  }>
  groups: Array<{
    id: string
    roomUsername: string
    name: string
    avatar: string | null
    memberCount: number | null
    conversationId: string | null
  }>
}
```

规则：

- 联系人返回本地数据库中已同步的全部联系人
- 群组返回本地数据库中已同步的全部群组
- 若该联系人/群组已有会话，则带回 `conversationId`
- 若无会话，则 `conversationId = null`

这样前端无需二次拼装“目录项是否已有会话”的关系。

### 打开或创建会话接口

新增接口：

`POST /api/conversations/open`

请求结构建议：

```ts
type OpenConversationRequest =
  | { type: 'private'; username: string }
  | { type: 'group'; roomUsername: string }
```

返回结构建议：

```ts
{
  conversationId: string
}
```

服务端行为：

1. 根据入参定位联系人或群组
2. 查找对应 Conversation
3. 若已存在，返回已有 `conversationId`
4. 若不存在，创建新 Conversation 并返回 `conversationId`

推荐使用单一 `openConversation` 接口，而不是让前端先查再建，原因是：

- 后端可保证幂等
- 前端逻辑更简单
- 避免并发点击导致重复创建会话

### 服务与路由边界

后端建议拆分为两个独立能力：

1. `DirectoryService`
   - 负责聚合联系人、群组与已有会话关系
   - 输出给 `/api/directory`

2. `ConversationService.open(...)`
   - 负责“查找已有会话或创建新会话”
   - 输出给 `/api/conversations/open`

职责分离后：

- `DirectoryService` 只负责浏览数据
- `ConversationService` 只负责会话打开语义
- 两者可以独立测试

## 前端数据流

### 进入聊天页

- 默认 `sidebarMode = conversations`
- 默认 `isSidebarCollapsed = false`
- 右侧消息区仍根据 `selectedConversationId` 渲染

### 切换到目录模式

1. 用户点击轨道底部的 `联系人/群组` 按钮
2. `sidebarMode` 切换为 `directory`
3. 若目录数据未加载，则调用 `GET /api/directory`
4. 渲染搜索框、联系人分组、群组分组

### 点击目录项

1. 若目录项已有 `conversationId`
   - 直接调用 `selectConversation(conversationId)`
2. 若目录项没有 `conversationId`
   - 调用 `POST /api/conversations/open`
   - 成功后拿到新的 `conversationId`
   - 调用 `selectConversation(conversationId)`
   - 使 `['conversations']` query 失效，刷新会话列表

### 折叠与展开

- 折叠仅影响左侧导航占宽，不影响当前会话
- 折叠状态下点击模式按钮，只记录模式切换
- 重新展开时，显示用户最后一次选择的模式内容

## 搜索与分组交互

目录页搜索仅作用于 `DirectoryPanel` 当前已加载的数据。

搜索规则：

- 输入时前端本地实时过滤
- 同时过滤联系人和群组两个分组
- 建议使用不区分大小写的包含匹配
- 联系人匹配字段：`remark`、`nickname`、`username`
- 群组匹配字段：`name`、`roomUsername`

分组行为：

- `联系人` 和 `群组` 默认展开
- 用户可手动折叠/展开
- 折叠状态在当前页面会话内保持
- 搜索不会强制改写分组展开状态

空状态：

- 某个分组过滤为空时，仅显示该分组为空
- 两个分组都为空时，显示统一空状态“未找到匹配的联系人或群组”

## 错误处理

### 目录列表加载失败

- 仅在 `DirectoryPanel` 内显示错误态
- 不影响 `会话` 模式和右侧聊天功能
- 提供明确文案，例如“无法加载联系人和群组，请稍后重试”

### 打开/创建会话失败

- 不切换当前选中的会话
- 显示轻量错误提示
- 不在前端本地制造临时会话数据

### 非法请求

后端对以下情况返回错误：

- `type` 非法
- 联系人不存在
- 群组不存在
- 请求缺少必需标识字段

前端收到错误时仅提示，不做兜底创建。

## 实现范围

前端改动建议涉及：

- `apps/web/src/pages/ChatPage.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`
- 新增 `SidebarRail`、`SidebarPanel`、`DirectoryPanel`
- 可能新增 `DirectorySection`、`DirectoryItem`
- `apps/web/src/stores/chatStore.ts`
- `apps/web/src/api/chat.ts`
- 新增 `useDirectory` hook

后端改动建议涉及：

- 新增 `directoryRoutes`
- `app.ts` 挂载目录路由
- 新增 `DirectoryService`
- 扩展 `ConversationService` 或相关 route 支持 `openConversation`
- `DatabaseService` 新增目录查询方法与会话映射查询方法

## 测试策略

### 前端

组件与交互测试应覆盖：

- sidebar 折叠/展开
- `会话` / `联系人群组` 模式切换
- 目录分组折叠/展开
- 搜索过滤联系人和群组
- 点击已有会话目录项时直接切换
- 点击无会话目录项时调用 open 接口并切换

### 后端

服务与路由测试应覆盖：

- `GET /api/directory` 返回联系人、群组及正确的 `conversationId`
- `POST /api/conversations/open` 对已有会话返回原会话
- `POST /api/conversations/open` 对无会话创建新会话
- 非法参数返回错误
- 新建会话后出现在 `/api/conversations` 列表中

### 回归验证

- 现有会话列表正常加载
- 现有消息列表正常加载
- 发送消息能力不受影响
- 右侧空状态与当前会话切换逻辑不回归

## 风险与约束

- 本次目录数据依赖本地数据库中已同步的联系人和群组，未同步的数据不会显示
- 若联系人/群组同步延迟，目录页显示可能滞后于实际微信数据
- 本次不处理目录分页；当联系人/群组数量显著增加时，后续可再评估虚拟列表或分页

## 验收标准

以下条件全部满足时视为完成：

1. 左侧边栏顶部有折叠按钮，折叠后仅保留 3 个图标入口
2. 左侧边栏底部可切换 `会话` 与 `联系人/群组` 两个界面
3. `联系人/群组` 页面按分组展示，且支持折叠/展开
4. `联系人/群组` 页面支持前端本地搜索
5. 点击目录项时，已有会话直接进入，无会话则创建后进入
6. 新建会话后，会话列表可立即看到该 session
7. 现有聊天主流程无行为回归
