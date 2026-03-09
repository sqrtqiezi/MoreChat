# Phase 3 前端 MVP 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标**：实现 MoreChat 前端 MVP，提供会话列表、聊天窗口和文本消息收发功能

**架构**：React + React Router + Zustand（全局状态）+ TanStack Query（服务端状态）+ Tailwind CSS。采用渐进式实现，先搭建框架和静态 UI，再接入 API，最后集成 WebSocket。

**技术栈**：React 18, TypeScript, React Router v6, Zustand, TanStack Query, Axios, Tailwind CSS, @tanstack/react-virtual

**参考设计文档**：`docs/plans/2026-03-09-phase3-frontend-mvp-design.md`

---

## 阶段 1：基础框架搭建

### Task 1: 安装依赖并配置基础架构

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/types/index.ts`
- Create: `apps/web/src/stores/authStore.ts`
- Create: `apps/web/src/stores/chatStore.ts`

**Step 1: 安装所有必需依赖**

```bash
cd apps/web
pnpm add react-router-dom zustand @tanstack/react-virtual date-fns
```

**Step 2: 创建类型定义**

创建 `apps/web/src/types/index.ts`，定义 User, Conversation, Message, ClientStatus 等核心类型。

**Step 3: 创建 authStore**

创建 `apps/web/src/stores/authStore.ts`，使用 zustand persist 中间件实现登录状态持久化（localStorage）。MVP 阶段 mock 登录，接受任意用户名密码。

**Step 4: 创建 chatStore**

创建 `apps/web/src/stores/chatStore.ts`，管理当前选中的会话 ID。

**Step 5: 提交**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/types/ apps/web/src/stores/
git commit -m "chore: setup Phase 3 frontend foundation

- Add dependencies: react-router-dom, zustand, @tanstack/react-virtual, date-fns
- Define core TypeScript types
- Implement authStore with localStorage persistence
- Implement chatStore for conversation selection

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 实现登录页面

**Files:**
- Create: `apps/web/src/components/auth/LoginForm.tsx`
- Create: `apps/web/src/components/auth/ProtectedRoute.tsx`
- Create: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: 创建 LoginForm 组件**

实现表单验证（非空检查）、loading 状态、错误提示。使用 authStore 的 login 方法。

**Step 2: 创建 ProtectedRoute 组件**

检查 authStore.isAuthenticated，未登录则重定向到 /login。

**Step 3: 创建 LoginPage**

居中卡片布局，显示 logo、tagline 和 LoginForm。如果已登录则自动跳转到 /chat。

**Step 4: 配置路由**

更新 `App.tsx`，配置 React Router：
- `/login` → LoginPage
- `/chat` → ChatPage (ProtectedRoute)
- `/` → 重定向到 /chat

**Step 5: 验证功能**

```bash
pnpm dev
```

访问 http://localhost:3000，验证：
- 未登录自动跳转到 /login
- 登录后跳转到 /chat
- 刷新页面保持登录状态

**Step 6: 提交**

```bash
git add apps/web/src/components/auth/ apps/web/src/pages/LoginPage.tsx apps/web/src/App.tsx
git commit -m "feat: implement login page with authentication

- LoginForm with validation and error handling
- ProtectedRoute for auth guard
- LoginPage with centered card layout
- Configure routing (/login, /chat, /)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 创建 ChatPage 骨架

**Files:**
- Create: `apps/web/src/pages/ChatPage.tsx`

**Step 1: 创建两栏布局**

左侧 Sidebar (320px 固定宽度)，右侧 ChatWindow (flex-1)。使用 Tailwind CSS 实现现代简约风格。

**Step 2: 添加占位内容**

Sidebar 和 ChatWindow 各显示一个标题，表明布局结构。

**Step 3: 验证布局**

登录后查看 /chat 页面，确认两栏布局正确显示。

**Step 4: 提交**

```bash
git add apps/web/src/pages/ChatPage.tsx
git commit -m "feat: create ChatPage skeleton with two-column layout

- Sidebar (320px) + ChatWindow (flex-1)
- Basic structure with placeholders

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 阶段 2：静态 UI 组件

### Task 4: 实现 Sidebar 组件

**Files:**
- Create: `apps/web/src/components/layout/Sidebar.tsx`
- Create: `apps/web/src/components/layout/ClientStatus.tsx`
- Create: `apps/web/src/components/chat/ConversationList.tsx`
- Create: `apps/web/src/components/chat/ConversationItem.tsx`
- Create: `apps/web/src/utils/mockData.ts`

**Step 1: 创建 mock 数据**

在 `utils/mockData.ts` 中创建 5-10 个 mock 会话数据。

**Step 2: 创建 ClientStatus 组件**

显示在线/离线状态，带绿色/红色圆点指示器。

**Step 3: 创建 ConversationItem 组件**

显示头像（首字母）、会话名称、最后消息预览、相对时间、未读数徽章。实现选中状态高亮和 hover 效果。

**Step 4: 创建 ConversationList 组件**

渲染 ConversationItem 列表，使用 chatStore 管理选中状态。

**Step 5: 创建 Sidebar 组件**

组合 ClientStatus 和 ConversationList。

**Step 6: 更新 ChatPage**

将 Sidebar 组件集成到 ChatPage。

**Step 7: 验证交互**

点击会话项，验证选中状态切换正常。

**Step 8: 提交**

```bash
git add apps/web/src/components/layout/ apps/web/src/components/chat/ConversationList.tsx apps/web/src/components/chat/ConversationItem.tsx apps/web/src/utils/mockData.ts apps/web/src/pages/ChatPage.tsx
git commit -m "feat: implement Sidebar with conversation list

- ClientStatus component with online/offline indicator
- ConversationItem with avatar, name, preview, timestamp, unread badge
- ConversationList with selection state
- Sidebar component combining all parts
- Mock data for testing

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 实现 ChatWindow 组件

**Files:**
- Create: `apps/web/src/components/chat/ChatWindow.tsx`
- Create: `apps/web/src/components/chat/ChatHeader.tsx`
- Create: `apps/web/src/components/chat/MessageList.tsx`
- Create: `apps/web/src/components/chat/MessageItem.tsx`
- Create: `apps/web/src/components/chat/MessageInput.tsx`

**Step 1: 创建 ChatHeader 组件**

显示当前会话名称和在线状态。

**Step 2: 创建 MessageItem 组件**

左右对齐（isMine 判断），显示头像、昵称、消息内容、时间戳、发送状态。

**Step 3: 创建 MessageList 组件**

使用 @tanstack/react-virtual 实现虚拟滚动，渲染 20-30 条 mock 消息。

**Step 4: 创建 MessageInput 组件**

多行 textarea，自动高度调整，Enter 发送（Shift+Enter 换行），发送按钮。

**Step 5: 创建 ChatWindow 组件**

组合 ChatHeader、MessageList、MessageInput。根据 chatStore.selectedConversationId 显示内容或空状态。

**Step 6: 更新 ChatPage**

将 ChatWindow 组件集成到 ChatPage。

**Step 7: 验证交互**

- 选择会话后显示对应消息列表
- 输入框能输入文字
- Enter 键清空输入框（暂不发送到后端）
- 消息列表滚动流畅

**Step 8: 提交**

```bash
git add apps/web/src/components/chat/ apps/web/src/pages/ChatPage.tsx
git commit -m "feat: implement ChatWindow with message list and input

- ChatHeader with conversation name
- MessageItem with left/right alignment
- MessageList with virtual scrolling
- MessageInput with auto-resize textarea
- ChatWindow combining all parts
- Empty state when no conversation selected

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 阶段 3：API 集成

### Task 6: 创建 API 客户端

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/api/chat.ts`

**Step 1: 创建 Axios 实例**

配置 baseURL 为 `/api`，添加请求/响应拦截器（401 跳转登录）。

**Step 2: 创建 chat API 方法**

实现 getConversations, getMessages, sendMessage, markAsRead。

**Step 3: 提交**

```bash
git add apps/web/src/api/
git commit -m "feat: create API client for backend integration

- Axios instance with /api baseURL
- Request/response interceptors
- Chat API methods (conversations, messages, send, markAsRead)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 实现 TanStack Query hooks

**Files:**
- Create: `apps/web/src/hooks/useConversations.ts`
- Create: `apps/web/src/hooks/useMessages.ts`
- Create: `apps/web/src/hooks/useSendMessage.ts`

**Step 1: 创建 useConversations hook**

使用 useQuery，5 秒轮询，queryKey: ['conversations']。

**Step 2: 创建 useMessages hook**

使用 useQuery，3 秒轮询，queryKey: ['messages', conversationId]，enabled: !!conversationId。

**Step 3: 创建 useSendMessage hook**

使用 useMutation，成功后 invalidate messages query。

**Step 4: 提交**

```bash
git add apps/web/src/hooks/
git commit -m "feat: implement TanStack Query hooks for data fetching

- useConversations with 5s polling
- useMessages with 3s polling
- useSendMessage mutation with cache invalidation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 集成真实 API 数据

**Files:**
- Modify: `apps/web/src/components/chat/ConversationList.tsx`
- Modify: `apps/web/src/components/chat/MessageList.tsx`
- Modify: `apps/web/src/components/chat/MessageInput.tsx`
- Modify: `apps/web/src/components/layout/ClientStatus.tsx`

**Step 1: 更新 ConversationList**

使用 useConversations hook 替换 mock 数据，添加 loading 和 error 状态。

**Step 2: 更新 MessageList**

使用 useMessages hook 替换 mock 数据，添加 loading 和 error 状态。

**Step 3: 更新 MessageInput**

使用 useSendMessage hook 实现真实发送，显示发送中状态，处理错误。

**Step 4: 更新 ClientStatus**

调用 GET /api/client/status 获取真实状态（可选：如果后端 API 可用）。

**Step 5: 测试端到端流程**

启动后端服务器，测试：
- 会话列表加载
- 点击会话加载消息
- 发送消息成功
- 轮询获取新消息

**Step 6: 提交**

```bash
git add apps/web/src/components/
git commit -m "feat: integrate real API data with TanStack Query

- Replace mock data with API calls
- Add loading and error states
- Implement real message sending
- Enable polling for real-time updates

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 阶段 4：WebSocket 集成

### Task 9: 实现 WebSocket 客户端

**Files:**
- Create: `apps/web/src/api/websocket.ts`
- Create: `apps/web/src/hooks/useWebSocket.ts`
- Modify: `apps/web/src/pages/ChatPage.tsx`

**Step 1: 创建 WebSocket 客户端**

连接到 `ws://localhost:3100`，实现自动重连，监听 `message:new` 事件。

**Step 2: 创建 useWebSocket hook**

封装 WebSocket 连接和事件监听，返回连接状态和消息处理函数。

**Step 3: 在 ChatPage 中集成 WebSocket**

建立连接，监听新消息事件，更新 TanStack Query 缓存。

**Step 4: 移除轮询配置**

从 useConversations 和 useMessages 中移除 refetchInterval。

**Step 5: 测试实时消息**

使用两个浏览器窗口或 Postman 发送消息，验证实时推送。

**Step 6: 提交**

```bash
git add apps/web/src/api/websocket.ts apps/web/src/hooks/useWebSocket.ts apps/web/src/pages/ChatPage.tsx apps/web/src/hooks/useConversations.ts apps/web/src/hooks/useMessages.ts
git commit -m "feat: implement WebSocket for real-time messaging

- WebSocket client with auto-reconnect
- useWebSocket hook for connection management
- Integrate WebSocket in ChatPage
- Remove polling in favor of WebSocket push

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 阶段 5：优化和完善

### Task 10: 性能和用户体验优化

**Files:**
- Modify: `apps/web/src/components/chat/MessageList.tsx`
- Modify: `apps/web/src/components/chat/MessageInput.tsx`
- Modify: `apps/web/src/components/chat/ConversationItem.tsx`
- Create: `apps/web/src/components/common/Skeleton.tsx`
- Create: `apps/web/src/components/common/EmptyState.tsx`

**Step 1: 优化 MessageList**

- 实现自动滚动到底部（新消息或切换会话）
- 使用 React.memo 优化 MessageItem
- 添加 Skeleton loading 状态

**Step 2: 优化 MessageInput**

- 输入框自动聚焦
- 添加键盘快捷键（Esc 清空）
- 优化 textarea 自动高度调整

**Step 3: 添加空状态组件**

- 无会话时显示友好提示
- 无消息时显示空状态

**Step 4: 添加加载状态**

- Skeleton 组件用于会话列表和消息列表
- Spinner 用于按钮 loading

**Step 5: 添加动效**

- 消息淡入动画
- 会话切换过渡
- hover 状态优化

**Step 6: 代码优化**

- 提取自定义 hooks（useMessageScroll, useConversationSelection）
- 完善 TypeScript 类型
- 添加必要注释

**Step 7: 全面测试**

测试所有功能：登录、会话切换、消息收发、实时推送、错误处理。

**Step 8: 提交**

```bash
git add apps/web/src/
git commit -m "feat: optimize performance and user experience

- Auto-scroll to bottom in MessageList
- React.memo optimization
- Skeleton and empty states
- Input auto-focus and keyboard shortcuts
- Smooth animations and transitions
- Extract custom hooks
- Improve TypeScript types

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 验收标准

完成所有任务后，MVP 应满足：

1. **登录功能**：
   - 能够登录（mock 认证）
   - 刷新页面保持登录状态
   - 未登录自动跳转

2. **会话列表**：
   - 显示所有会话
   - 显示最后消息预览和时间
   - 显示未读数
   - 点击切换会话

3. **聊天窗口**：
   - 显示当前会话消息
   - 消息左右对齐
   - 虚拟滚动流畅
   - 自动滚动到底部

4. **消息发送**：
   - 能够发送文本消息
   - 显示发送状态
   - 错误处理和重试

5. **实时更新**：
   - WebSocket 实时推送新消息
   - 自动更新会话列表
   - 断线自动重连

6. **用户体验**：
   - 界面符合现代简约风格
   - 加载状态友好
   - 空状态提示清晰
   - 交互流畅无卡顿

---

## 技术债务和后续优化

1. **认证**：实现真实的登录 API 和 token 管理
2. **多媒体**：支持图片、文件消息
3. **群组管理**：群组创建、成员管理
4. **消息搜索**：全文搜索功能
5. **已读回执**：消息状态跟踪
6. **移动端优化**：响应式布局深度优化
7. **离线支持**：Service Worker 和本地缓存
8. **性能监控**：添加性能指标追踪

---

## 参考资料

- **设计文档**：`docs/plans/2026-03-09-phase3-frontend-mvp-design.md`
- **后端 API 文档**：`docs/juhexbot-api.md`
- **Phase 2 实现**：`docs/plans/2026-03-09-phase2-implementation.md`
- **React Router 文档**：https://reactrouter.com/
- **Zustand 文档**：https://zustand-demo.pmnd.rs/
- **TanStack Query 文档**：https://tanstack.com/query/latest
- **Tailwind CSS 文档**：https://tailwindcss.com/
