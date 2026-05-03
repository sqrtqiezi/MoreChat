# MoreChat E2E 测试计划与现状

本文档用于记录当前 E2E 覆盖情况、已知缺口和后续推进顺序。

`docs/e2e-testing-spec.md` 是规范基线；本文不重复规范，只记录“现在做到哪里了、接下来补什么”。

## 0. Handoff Snapshot

- 当前最高风险、最低置信度区域：媒体发送、搜索结果稳定性以及其他仍依赖更丰富测试数据的复杂场景。
- `messaging.feature` 已迁移到真实系统服务链路：真实 `/api/*`、真实数据库与 data lake、真实 `/webhook` 和 WebSocket，只在服务端聚合 Bot 边界启用 E2E 替身。
- 旧的浏览器侧消息 API 假响应及其文档说明应视为已删除，不再保留隔离区或回退指引。
- 推荐下一步：把后续工作转到 media、search、feed、topics 等剩余特性的数据准备和真实环境覆盖，而不是继续稳定浏览器侧 API 假响应。
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

- 带后端数据依赖的复杂页面状态
- 媒体、文件、分页、错误恢复等复杂场景

## 4. 当前主要阻塞

### 4.1 非 messaging 特性的测试数据准备仍不充分

相关文件：

- `apps/web/tests/features/media.feature`
- `apps/web/tests/features/search.feature`
- `apps/web/tests/features/feed.feature`
- `apps/web/tests/features/topics.feature`

消息链路已经不再依赖浏览器侧系统 API 假响应；当前主要问题转移为其他 feature 缺少同等级别的真实环境准备、固定数据和断言收敛方式。

### 4.2 已识别的原因方向

后续排查与修复可优先围绕以下方向：

1. media / search / feed / topics 仍缺少可重复执行的 reset/seed 流程
2. 某些复杂页面依赖真实后台状态切换，尚未抽出稳定的准备脚本
3. WebSocket、分页和异步索引更新场景需要更严格的等待与断言策略
4. 当前 feature 之间的数据隔离边界还需要继续收紧

### 4.3 推荐处理顺序

1. 先沿用 messaging 的真实环境路线，为 media 建立固定数据和最小可重复链路
2. 再补 search / feed / topics 的真实数据准备与场景覆盖
3. 最后补错误恢复、断线重连、分页和更复杂的非功能场景

## 5. 后续补齐计划

### 5.1 高优先级

| 模块 | 场景方向 | 备注 |
|------|----------|------|
| Media | 图片发送、图片预览、文件下载、粘贴图片 | 沿用真实环境路线，补固定数据与断言 |
| Search | 联系人过滤、群组过滤、时间范围、分页、结果跳转 | 需要更稳定的数据准备策略 |

### 5.2 中优先级

| 模块 | 场景方向 | 备注 |
|------|----------|------|
| Feed | 卡片内容、分页加载、空状态与有数据状态切换 | 需要真实或可控测试数据 |
| Topics | 话题详情页、关联消息展示 | 同样依赖数据准备 |

### 5.3 低优先级

| 模块 | 场景方向 | 备注 |
|------|----------|------|
| Error Handling | 401、500、断线重连、重试提示 | 更适合在基础链路稳定后补齐 |
| 非功能扩展 | 性能、可访问性 | 不属于当前 E2E 主线第一阶段 |

## 6. 推荐的测试数据策略

为了让后续 feature 更容易扩展，应继续沿用真实环境 + reset/seed 的主策略，而不是在各个 step 中各自处理：

### 主策略：测试数据注入到本地后端

在测试前写入测试用户、会话、消息，再走真实 API。

适合：

- 需要更接近真实链路
- 后续要覆盖消息、搜索、Feed、Topics 的联动行为

风险：

- 需要额外的测试模式、清理机制或固定种子数据
- 对脚本和环境约束的维护要求更高

禁止回到浏览器侧系统 API 假响应路线；如果某个场景缺数据，应补 reset/seed、服务端测试模式或更稳定的环境准备，而不是在前端伪造 MoreChat 自身 `/api/*` 返回。

## 7. 文档边界

- 如何编写 feature、step definitions、page objects、hooks：见 `docs/e2e-testing-spec.md`
- 如何在本地准备环境和运行测试：见 `docs/e2e-testing-guide.md`
