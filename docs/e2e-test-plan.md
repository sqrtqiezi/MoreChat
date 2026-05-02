# MoreChat E2E 测试计划与现状

本文档用于记录当前 E2E 覆盖情况、已知缺口和后续推进顺序。

`docs/e2e-testing-spec.md` 是规范基线；本文不重复规范，只记录“现在做到哪里了、接下来补什么”。

## 0. Handoff Snapshot

- 当前最高风险、最低置信度区域：`messaging.feature` 的会话选择和消息发送链路，现有覆盖仍需要进一步验证稳定性。
- 推荐下一步：先把消息链路的 mock / 测试数据注入稳定住，再补现有 messaging 场景中的文本发送、空消息校验和接收新消息等基础覆盖。
- 交接前的基线验证命令：`cd apps/web && pnpm test:cucumber`

## 1. 当前基线

- 当前主测试体系：Cucumber + Playwright + TypeScript
- 当前主运行命令：`cd apps/web && pnpm test:cucumber`
- 当前主测试目录：`apps/web/tests/`
- 遗留实现：`apps/web/e2e/` 中仍保留旧版 Playwright 直测文件，不纳入当前计划主线

## 2. 已就绪的基础设施

| 组件 | 文件路径 | 作用 |
|------|----------|------|
| Cucumber 配置 | `apps/web/cucumber.cjs` | 配置 feature 路径、steps/hooks/support 导入与报告输出 |
| World | `apps/web/tests/support/world.ts` | 统一管理 browser、context、page、baseURL |
| Hooks | `apps/web/tests/hooks/hooks.ts` | 自动启动本地服务、失败截图、清理资源 |
| 通用步骤 | `apps/web/tests/steps/common.steps.ts` | 登录、导航、文本验证等跨 feature 能力 |
| 通用页面对象 | `apps/web/tests/pages/CommonPage.ts` | 通用页面元素与交互封装 |

当前基础设施能力：

- 运行测试时自动检查并复用 `3000` / `3100` 端口上的本地服务
- 若服务未启动，则由 Hooks 自动拉起前后端
- 失败时自动截图到 `apps/web/reports/screenshots/`
- 运行完成后生成 HTML / JSON 报告到 `apps/web/reports/`

## 3. 当前覆盖范围

### 3.1 已落地的 Feature

| Feature | 文件 | 说明 |
|---------|------|------|
| 认证 | `apps/web/tests/features/auth.feature` | 登录、认证失败、受保护页面访问 |
| 页面导航 | `apps/web/tests/features/navigation.feature` | 侧边栏导航与页面切换 |
| 搜索 | `apps/web/tests/features/search.feature` | 搜索页基础交互与模式切换 |
| 聊天页基础状态 | `apps/web/tests/features/chat.feature` | 聊天页空状态与结构展示 |
| Feed | `apps/web/tests/features/feed.feature` | Feed 页面基础加载与展示状态 |
| Topics | `apps/web/tests/features/topics.feature` | Topics 页面基础加载与展示状态 |
| 消息发送相关 | `apps/web/tests/features/messaging.feature` | 部分场景已写，仍存在阻塞问题 |

### 3.2 覆盖特点

当前已实现内容主要集中在：

- 认证与路由访问控制
- 主要页面可达性和基本 UI 状态
- 搜索页的基础交互

当前尚未形成稳定覆盖的内容主要集中在：

- 真实消息发送链路
- 带后端数据依赖的复杂页面状态
- 媒体、文件、分页、错误恢复等复杂场景

## 4. 当前主要阻塞

### 4.1 `messaging.feature` 稳定性不足

相关文件：

- `apps/web/tests/features/messaging.feature`
- `apps/web/tests/steps/messaging.steps.ts`

现有 messaging 场景里，`发送文本消息`、`空消息不能发送`、`未选择会话时输入框禁用`、`通过 WebSocket 接收新消息` 这些覆盖点都已经写出，但其中依赖先选中会话的链路稳定性不足。现有记录显示，测试尝试通过 Playwright `page.route()` mock 会话与消息接口，但会话列表未稳定渲染，导致这部分场景的可靠性还不够。

### 4.2 已识别的原因方向

后续排查与修复可优先围绕以下方向：

1. 页面初始化与 mock 注入时序不一致，`reload()` 后未按预期命中 mock
2. WebSocket 连接失败影响了消息区或会话区初始化
3. React Query 缓存 / 重试行为与当前测试步骤不匹配
4. mock 返回结构与前端实际消费的数据结构不完全一致

### 4.3 推荐处理顺序

1. 先让 `messaging.feature` 至少稳定覆盖“未选择会话时的禁用态”和“已选择会话后的基础输入态”
2. 再补“发送文本消息”这种依赖 mock 或测试数据注入的场景
3. 最后补 WebSocket 新消息接收、图片与文件发送等复杂链路

## 5. 后续补齐计划

### 5.1 高优先级

| 模块 | 场景方向 | 备注 |
|------|----------|------|
| Messaging | 发送文本消息、空消息校验、接收新消息 | 现有场景已写出，但覆盖稳定性不足，先解决 mock / 测试数据注入问题 |
| Media | 图片发送、图片预览、文件下载、粘贴图片 | 依赖消息链路先稳定 |

### 5.2 中优先级

| 模块 | 场景方向 | 备注 |
|------|----------|------|
| Search | 联系人过滤、群组过滤、时间范围、分页、结果跳转 | 需要更稳定的数据准备策略 |
| Feed | 卡片内容、分页加载、空状态与有数据状态切换 | 需要真实或可控测试数据 |
| Topics | 话题详情页、关联消息展示 | 同样依赖数据准备 |

### 5.3 低优先级

| 模块 | 场景方向 | 备注 |
|------|----------|------|
| Error Handling | 401、500、断线重连、重试提示 | 更适合在基础链路稳定后补齐 |
| 非功能扩展 | 性能、可访问性 | 不属于当前 E2E 主线第一阶段 |

## 6. 推荐的测试数据策略

为了让后续 feature 更容易扩展，建议统一选一种主策略，而不是在各个 step 中各自处理：

### 方案 A：前端层 mock

在页面初始化前注入 mock，统一拦截会话、消息、搜索等接口。

适合：

- 需要快速补齐 UI 状态与交互流
- 希望避免本地数据库构造成本

风险：

- 容易与真实页面初始化时序不一致
- mock 结构需要持续跟随后端返回格式演进

### 方案 B：测试数据注入到本地后端

在测试前写入测试用户、会话、消息，再走真实 API。

适合：

- 需要更接近真实链路
- 后续要覆盖消息、搜索、Feed、Topics 的联动行为

风险：

- 需要额外的测试模式、清理机制或固定种子数据
- 维护成本高于纯 mock

当前阶段更建议先完成一轮前端层 mock 稳定化，再评估是否切到测试数据注入方案。

## 7. 文档边界

- 如何编写 feature、step definitions、page objects、hooks：见 `docs/e2e-testing-spec.md`
- 如何在本地准备环境和运行测试：见 `docs/e2e-testing-guide.md`
