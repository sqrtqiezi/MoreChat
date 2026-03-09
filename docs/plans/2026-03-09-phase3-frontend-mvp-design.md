# Phase 3 前端 MVP 设计文档

**日期**：2026-03-09
**版本**：1.0
**状态**：已批准

## 概述

Phase 3 的目标是实现 MoreChat 的前端界面 MVP 版本，提供核心的聊天功能。本设计采用渐进式实现方案，优先保证基础功能可用，后续逐步优化体验。

### MVP 范围

- 会话列表展示
- 聊天窗口（文本消息收发）
- 简单登录页
- 桌面优先的响应式设计
- 现代简约的 UI 风格（类似 Telegram/Discord）

### 不包含的功能（后续 Phase）

- 多媒体消息（图片、文件）
- 群组管理
- 消息搜索
- 消息状态和已读回执
- 移动端深度优化

---

## 第一部分：整体架构和技术栈

### 项目结构

```
apps/web/src/
├── pages/              # 页面组件
│   ├── LoginPage.tsx   # 登录页
│   └── ChatPage.tsx    # 聊天页
├── components/         # UI 组件
│   ├── chat/          # 聊天相关组件
│   ├── common/        # 通用组件
│   └── layout/        # 布局组件
├── stores/            # Zustand 状态管理
│   ├── authStore.ts   # 认证状态
│   └── chatStore.ts   # 聊天状态
├── api/               # API 客户端
│   ├── client.ts      # Axios 实例
│   ├── auth.ts        # 认证 API
│   └── chat.ts        # 聊天 API
├── hooks/             # 自定义 hooks
│   ├── useAuth.ts     # 认证相关
│   └── useChat.ts     # 聊天相关
├── types/             # TypeScript 类型
└── utils/             # 工具函数
```

### 核心技术选型

- **路由**：React Router v6（`/login` 和 `/chat` 两个路由）
- **状态管理**：
  - Zustand：全局状态（认证信息、当前选中会话）
  - TanStack Query：服务端状态（会话列表、消息列表）
- **UI 组件**：手写（基于 Tailwind CSS，扩展现有 Button 组件）
- **HTTP 客户端**：Axios（已配置代理）
- **WebSocket**：第二阶段集成（先用 REST API 轮询）

### 数据流设计

```
用户操作 → React 组件 → Zustand Store / TanStack Query
                              ↓
                         API Client (Axios)
                              ↓
                         后端 REST API
                              ↓
                    数据返回 → 更新 UI
```

---

## 第二部分：UI 组件设计和布局

### 登录页 (LoginPage)

**布局**：居中卡片式设计

```
┌─────────────────────────────────┐
│                                 │
│         MoreChat Logo           │
│      Small is boring            │
│                                 │
│    ┌─────────────────────┐     │
│    │  用户名输入框        │     │
│    └─────────────────────┘     │
│    ┌─────────────────────┐     │
│    │  密码输入框          │     │
│    └─────────────────────┘     │
│                                 │
│    [ 登录按钮 ]                 │
│                                 │
└─────────────────────────────────┘
```

**组件拆分**：
- `LoginPage.tsx` - 页面容器
- `LoginForm.tsx` - 表单组件（使用 React Hook Form + Zod）
- 复用 `packages/ui` 的 Button 组件

**交互**：
- 表单验证（用户名/密码非空）
- 登录成功后跳转到 `/chat`
- 错误提示（Toast 或内联错误信息）

---

### 聊天页 (ChatPage)

**布局**：两栏式（桌面优先）

```
┌──────────────────────────────────────────────┐
│  Sidebar (320px)    │   ChatWindow (flex-1)  │
│                     │                        │
│  ┌────────────────┐ │  ┌──────────────────┐ │
│  │ ClientStatus   │ │  │  ChatHeader      │ │
│  └────────────────┘ │  └──────────────────┘ │
│                     │                        │
│  ┌────────────────┐ │  ┌──────────────────┐ │
│  │ Conversation   │ │  │                  │ │
│  │ List           │ │  │  MessageList     │ │
│  │                │ │  │  (虚拟滚动)       │ │
│  │  - 会话1       │ │  │                  │ │
│  │  - 会话2       │ │  │                  │ │
│  │  - 会话3       │ │  │                  │ │
│  └────────────────┘ │  └──────────────────┘ │
│                     │                        │
│                     │  ┌──────────────────┐ │
│                     │  │  MessageInput    │ │
│                     │  └──────────────────┘ │
└──────────────────────────────────────────────┘
```

**核心组件**：

#### 1. Sidebar (`components/layout/Sidebar.tsx`)
- ClientStatus：显示客户端在线状态（绿点/红点 + 文字）
- ConversationList：会话列表（可滚动）

#### 2. ConversationItem (`components/chat/ConversationItem.tsx`)
- 头像（圆形，使用首字母或默认图标）
- 会话名称
- 最后一条消息预览（截断）
- 时间戳（相对时间，如 "5分钟前"）
- 未读消息数（红色徽章）
- 选中状态高亮

#### 3. ChatWindow (`components/chat/ChatWindow.tsx`)
- ChatHeader：显示当前会话名称和在线状态
- MessageList：消息列表（虚拟滚动，使用 `react-window` 或 `@tanstack/react-virtual`）
- MessageInput：消息输入框

#### 4. MessageItem (`components/chat/MessageItem.tsx`)
- 发送者头像和昵称
- 消息内容（文本，支持换行）
- 时间戳
- 发送状态（发送中/已发送/失败）
- 左右对齐（自己的消息靠右，对方的靠左）

#### 5. MessageInput (`components/chat/MessageInput.tsx`)
- 多行文本输入框（`textarea`，自动高度调整）
- 发送按钮
- Enter 发送，Shift+Enter 换行

**样式风格**（现代简约）：
- 圆角：8px（卡片）、16px（消息气泡）
- 间距：充足的留白（padding: 16px/24px）
- 颜色：浅色背景 + 深色文字，主题色用于高亮
- 动效：hover 状态、选中状态的平滑过渡（transition: 200ms）
- 阴影：轻微的 box-shadow 用于层次感

---

## 第三部分：状态管理和数据流

### Zustand Store 设计

#### 1. authStore.ts - 认证状态

```typescript
interface AuthState {
  isAuthenticated: boolean
  user: { username: string } | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}
```

**职责**：
- 管理登录状态
- 存储用户信息
- 提供登录/登出方法
- 持久化到 localStorage（刷新页面保持登录）

#### 2. chatStore.ts - 聊天状态

```typescript
interface ChatState {
  selectedConversationId: string | null
  selectConversation: (id: string) => void
  clearSelection: () => void
}
```

**职责**：
- 管理当前选中的会话
- 提供会话切换方法

---

### TanStack Query 使用

#### 1. 会话列表查询

```typescript
useQuery({
  queryKey: ['conversations'],
  queryFn: () => api.getConversations(),
  refetchInterval: 5000, // 5秒轮询（模拟实时）
})
```

#### 2. 消息列表查询

```typescript
useQuery({
  queryKey: ['messages', conversationId],
  queryFn: () => api.getMessages(conversationId),
  enabled: !!conversationId, // 只在选中会话时查询
  refetchInterval: 3000, // 3秒轮询
})
```

#### 3. 发送消息 Mutation

```typescript
useMutation({
  mutationFn: (data) => api.sendMessage(data),
  onSuccess: () => {
    // 刷新消息列表
    queryClient.invalidateQueries(['messages', conversationId])
  },
})
```

---

### API 客户端设计

#### api/client.ts - Axios 实例配置
- baseURL: `/api`（Vite 代理到 3100 端口）
- 请求拦截器：添加认证 token（如果有）
- 响应拦截器：统一错误处理（401 跳转登录）

#### api/auth.ts - 认证 API

```typescript
export const authApi = {
  login: (username: string, password: string) =>
    client.post('/auth/login', { username, password }),
  // MVP 阶段可能不需要真实的登录 API，先 mock
}
```

#### api/chat.ts - 聊天 API

```typescript
export const chatApi = {
  getConversations: () =>
    client.get('/conversations'),

  getMessages: (conversationId: string, params?: { limit, offset }) =>
    client.get(`/conversations/${conversationId}/messages`, { params }),

  sendMessage: (data: { conversationId: string, content: string }) =>
    client.post('/messages/send', data),

  markAsRead: (conversationId: string) =>
    client.put(`/conversations/${conversationId}/read`),
}
```

---

### 数据流示例

#### 场景 1：用户发送消息

```
用户输入 → MessageInput 组件
         ↓
    调用 sendMessage mutation
         ↓
    POST /api/messages/send
         ↓
    成功后 invalidate messages query
         ↓
    自动重新获取消息列表
         ↓
    UI 更新显示新消息
```

#### 场景 2：接收新消息（轮询模式）

```
TanStack Query 每 3 秒自动执行
         ↓
    GET /api/conversations/:id/messages
         ↓
    检测到新消息（通过 messageId 对比）
         ↓
    更新 UI 显示新消息
         ↓
    如果会话在列表中，更新"最后一条消息"预览
```

---

### 错误处理策略

1. **网络错误**：Toast 提示 "网络连接失败，请重试"
2. **401 未授权**：自动跳转到登录页
3. **发送消息失败**：消息项显示"发送失败"状态，提供重试按钮
4. **查询失败**：显示错误占位符，提供刷新按钮

---

## 第四部分：实现阶段划分

### 阶段 1：基础框架搭建（1-2 天）

**目标**：搭建项目骨架，能看到基本界面

**任务**：
1. 安装依赖：React Router、Zustand、react-window（虚拟滚动）
2. 创建路由结构（`/login` 和 `/chat`）
3. 实现 authStore（登录状态管理 + localStorage 持久化）
4. 实现 LoginPage 和 LoginForm（暂时 mock 登录，任意用户名密码都能通过）
5. 创建 ChatPage 基础布局（Sidebar + ChatWindow 空壳）
6. 实现路由守卫（未登录跳转到 `/login`）

**验收标准**：
- 能在登录页输入信息并跳转到聊天页
- 聊天页显示两栏布局（空白）
- 刷新页面保持登录状态

---

### 阶段 2：静态 UI 组件（2-3 天）

**目标**：完成所有 UI 组件，使用 mock 数据展示

**任务**：
1. 实现 Sidebar 组件：
   - ClientStatus（显示在线/离线状态）
   - ConversationList（使用 mock 数据渲染 5-10 个会话）
   - ConversationItem（头像、名称、最后消息、时间、未读数）

2. 实现 ChatWindow 组件：
   - ChatHeader（显示当前会话名称）
   - MessageList（使用 mock 数据渲染 20-30 条消息）
   - MessageItem（左右对齐、头像、内容、时间）
   - MessageInput（多行输入框 + 发送按钮）

3. 实现 chatStore（管理选中会话）

4. 样式优化：
   - 应用现代简约风格（圆角、留白、过渡动效）
   - hover 和选中状态
   - 响应式调整（虽然桌面优先，但基本的适配要做）

**验收标准**：
- 点击会话列表能切换聊天窗口内容
- 所有组件样式符合"现代简约"风格
- 消息列表支持滚动，性能流畅（虚拟滚动）
- 输入框能输入文字，Enter 触发发送（暂时只是清空输入框）

---

### 阶段 3：API 集成（2-3 天）

**目标**：接入真实后端 API，实现数据交互

**任务**：
1. 创建 API 客户端（`api/client.ts`、`api/chat.ts`）
2. 实现 TanStack Query hooks：
   - `useConversations`（获取会话列表，5 秒轮询）
   - `useMessages`（获取消息列表，3 秒轮询）
   - `useSendMessage`（发送消息 mutation）

3. 替换 mock 数据为真实 API 数据：
   - ConversationList 使用 `useConversations`
   - MessageList 使用 `useMessages`
   - MessageInput 使用 `useSendMessage`

4. 实现错误处理：
   - 网络错误 Toast 提示
   - 401 自动跳转登录
   - 发送失败显示重试按钮

5. 优化用户体验：
   - 发送消息时显示"发送中"状态
   - 发送成功后滚动到底部
   - 切换会话时自动标记已读

**验收标准**：
- 能从后端获取真实会话列表和消息
- 能成功发送消息并在界面上看到
- 轮询能自动获取新消息（模拟实时）
- 错误情况有友好提示

---

### 阶段 4：WebSocket 集成（1-2 天）

**目标**：替换轮询为 WebSocket 实时推送

**任务**：
1. 创建 WebSocket 客户端（`api/websocket.ts`）
2. 在 ChatPage 中建立 WebSocket 连接
3. 监听 `message:new` 事件，收到新消息时：
   - 如果是当前会话，直接添加到消息列表
   - 如果是其他会话，更新会话列表的"最后消息"和未读数
4. 移除 TanStack Query 的轮询配置
5. 处理 WebSocket 断线重连

**验收标准**：
- 收到新消息立即显示（无需等待轮询）
- WebSocket 断线后能自动重连
- 性能优于轮询方案

---

### 阶段 5：优化和完善（1-2 天）

**目标**：提升用户体验和代码质量

**任务**：
1. 性能优化：
   - 虚拟滚动优化（MessageList）
   - React.memo 优化不必要的重渲染
   - 图片懒加载（头像）

2. 交互优化：
   - 消息列表自动滚动到底部（新消息或切换会话）
   - 输入框自动聚焦
   - 键盘快捷键（Esc 清空输入框）

3. 视觉优化：
   - 加载状态（Skeleton 或 Spinner）
   - 空状态（无会话、无消息）
   - 动效优化（消息淡入、会话切换过渡）

4. 代码优化：
   - 提取自定义 hooks（`useConversationSelection`、`useMessageScroll`）
   - 类型定义完善
   - 代码注释和文档

**验收标准**：
- 界面流畅，无明显卡顿
- 交互符合用户习惯
- 代码结构清晰，易于维护

---

### 时间估算

- **总计**：7-12 天（取决于开发节奏和遇到的问题）
- **最快路径**：如果一切顺利，7 天可以完成 MVP
- **保守估计**：考虑调试和优化，10-12 天更现实

---

### 风险和应对

**风险 1**：后端 API 返回的数据结构与预期不符
- **应对**：先用 Postman/curl 测试 API，确认数据结构后再开发

**风险 2**：虚拟滚动实现复杂，性能不达预期
- **应对**：先用普通滚动，消息数量不多时性能够用，后续再优化

**风险 3**：WebSocket 集成遇到跨域或连接问题
- **应对**：先用轮询完成 MVP，WebSocket 作为独立任务后续优化

---

## 总结

本设计采用渐进式实现方案，将 Phase 3 前端 MVP 分为 5 个阶段：

1. **基础框架搭建** - 路由、登录、布局骨架
2. **静态 UI 组件** - 完整的界面和交互（mock 数据）
3. **API 集成** - 接入真实后端，轮询模拟实时
4. **WebSocket 集成** - 真正的实时消息推送
5. **优化和完善** - 性能、交互、视觉优化

这种方案的优势在于：
- 每个阶段都有明确的目标和验收标准
- 风险可控，可以随时调整优先级
- 快速验证核心功能，避免过度设计
- 为后续扩展留有空间

预计 7-12 天可以完成 MVP，交付一个可用的聊天界面。
