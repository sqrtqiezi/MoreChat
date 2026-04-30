# 阶段 4：减法执行清单设计

**日期：** 2026-04-30  
**状态：** 设计完成，待评审  
**目标：** 移除"微信 Web 客户端"遗留功能，聚焦知识库核心能力

---

## 一、背景与目标

### 1.1 背景

MoreChat 已完成知识库核心功能的实施：
- ✅ 阶段 1：搜索引擎层（DuckDB FTS + VSS）
- ✅ 阶段 2：知识处理管道（摘要生成 + 主题聚类）
- ✅ 阶段 3A：知识库搜索首页
- ✅ 阶段 3B：重要消息 Feed、话题列表与侧栏

现在需要清理早期"微信 Web 客户端"方向的遗留功能，降低代码维护负担，聚焦知识库定位。

### 1.2 核心目标

**移除内容：**
1. 表情包下载功能（EmojiService、emojiDownloadQueue）
2. 表情包相关 API 和前端组件
3. 不需要的 WebSocket 事件
4. 消息发送的乐观更新逻辑

**保留内容：**
1. 图片发送功能（ImageInput、send-image API）
2. 图片查看功能（ImageService）
3. 文件访问功能（FileService）
4. OSS 服务（FileService 依赖）
5. EmojiCache 数据库表（保留但不再使用）

### 1.3 设计决策

**关键决策：**
- **EmojiCache 表处理**：保留表但停止使用（选项 A）
- **WebSocket 事件**：保留 message:new、highlight:new、message:recall（选项 B）
- **消息发送体验**：完全移除乐观更新，等待真实消息（选项 A）
- **图片发送功能**：保留（用户明确要求）
- **实施方案**：激进清理 - 一次性完全移除（方案 A）

---

## 二、后端架构变更

### 2.1 服务层移除

**完全删除以下文件：**
```
apps/server/src/services/emojiService.ts
apps/server/src/services/emojiService.test.ts
apps/server/src/services/emojiDownloadQueue.ts
apps/server/src/services/emojiDownloadQueue.test.ts
```

**移除原因：**
- 表情包下载不再是知识库的核心功能
- 增加系统复杂度和维护负担
- 依赖 OSS 上传，增加资源消耗

### 2.2 依赖注入清理

**在 `apps/server/src/index.ts` 中：**

```typescript
// 移除前：
const emojiService = new EmojiService(prisma, fileService);
const emojiDownloadQueue = new EmojiDownloadQueue(emojiService);

// 移除后：
// 完全删除这两行
```

**影响的服务：**
- `MessageService`：移除 `emojiDownloadQueue` 依赖
- `WebSocketService`：移除 `emojiService` 依赖
- 所有相关测试文件

**清理步骤：**
1. 从 `index.ts` 删除 EmojiService 和 EmojiDownloadQueue 实例化
2. 从 MessageService 构造函数移除 `emojiDownloadQueue` 参数
3. 从 WebSocketService 构造函数移除 `emojiService` 参数
4. 更新所有测试文件中的 mock 对象

### 2.3 MessageService 简化

**在 `apps/server/src/services/messageService.ts` 中：**

```typescript
// 移除前：
constructor(
  private prisma: PrismaClient,
  private dataLake: DataLakeService,
  private emojiDownloadQueue: EmojiDownloadQueue
) {}

async createMessage(data: CreateMessageInput) {
  // ... 创建消息逻辑
  
  // 触发表情包下载
  if (message.type === 47) {
    await this.emojiDownloadQueue.enqueue(message.id);
  }
}

// 移除后：
constructor(
  private prisma: PrismaClient,
  private dataLake: DataLakeService
) {}

async createMessage(data: CreateMessageInput) {
  // ... 创建消息逻辑
  // 完全移除表情包下载逻辑
}
```

**影响范围：**
- 移除 `emojiDownloadQueue` 依赖
- 移除消息创建时的表情包下载触发逻辑
- 保留所有其他消息处理逻辑（文本、图片、文件等）

### 2.4 API 路由清理

**删除以下路由文件：**
```
apps/server/src/routes/emoji.ts
apps/server/src/routes/emoji.test.ts
```

**在 `apps/server/src/index.ts` 中移除路由注册：**
```typescript
// 移除前：
import emojiRoutes from './routes/emoji';
app.route('/api/emoji', emojiRoutes);

// 移除后：
// 完全删除这两行
```

**移除的 API 端点：**
- `GET /api/emoji/:id` - 获取表情包信息
- `POST /api/emoji/:id/download` - 触发表情包下载
- `GET /api/emoji/:id/status` - 查询下载状态

**保留的 API 端点：**
- `POST /api/conversations/:id/send-image` - 发送图片消息
- `GET /api/files/:id` - 访问文件资源
- `GET /api/images/:id` - 访问图片资源

### 2.5 WebSocket 服务简化

**在 `apps/server/src/services/websocketService.ts` 中：**

```typescript
// 移除前：
constructor(
  private wss: WebSocketServer,
  private emojiService: EmojiService
) {}

async handleEmojiDownloadComplete(emojiId: string) {
  const emoji = await this.emojiService.getEmoji(emojiId);
  this.broadcast({
    type: 'emoji:downloaded',
    data: emoji
  });
}

// 移除后：
constructor(
  private wss: WebSocketServer
) {}

// 完全删除 handleEmojiDownloadComplete 方法
```

**移除的 WebSocket 事件：**
- `emoji:downloaded` - 表情包下载完成通知
- `emoji:download:progress` - 下载进度更新

**保留的 WebSocket 事件：**
- `message:new` - 新消息通知
- `highlight:new` - 新重要消息通知
- `message:recall` - 消息撤回通知

### 2.6 Prisma Schema 调整

**在 `apps/server/prisma/schema.prisma` 中：**

`EmojiCache` 模型定义保持不变，不做任何修改。只需停止在代码中使用它（即移除 EmojiService 后，不再有任何代码读写该表）。

**处理策略：**
- **不删除表**：避免数据库迁移风险
- **不写入新数据**：停止调用 EmojiService
- **不读取数据**：移除所有查询逻辑
- **未来清理**：可在后续版本中安全删除

**迁移策略：**
- 无需创建新的数据库迁移
- 现有数据保持不变
- 不影响其他表的正常使用

---

## 三、前端架构变更

### 3.1 组件移除

**完全删除以下文件：**
```
apps/web/src/components/EmojiPicker.tsx
apps/web/src/components/EmojiPicker.test.tsx
apps/web/src/components/EmojiViewer.tsx
apps/web/src/components/EmojiViewer.test.tsx
```

**移除原因：**
- 表情包选择器不再需要
- 表情包查看器不再需要
- 简化 UI 组件树

### 3.2 MessageInput 组件简化

**在 `apps/web/src/components/MessageInput.tsx` 中：**

```typescript
// 移除前：
import { EmojiPicker } from './EmojiPicker';
import { useOptimisticMessage } from '../hooks/useOptimisticMessage';

function MessageInput() {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const { addOptimisticMessage } = useOptimisticMessage();
  
  const handleSend = async () => {
    // 乐观更新
    const tempId = addOptimisticMessage(text);
    
    try {
      await sendMessage(text);
    } catch (error) {
      removeOptimisticMessage(tempId);
    }
  };
  
  return (
    <>
      <input />
      <button onClick={() => setShowEmojiPicker(true)}>😊</button>
      <ImageInput />
      {showEmojiPicker && <EmojiPicker />}
    </>
  );
}

// 移除后：
function MessageInput() {
  const handleSend = async () => {
    // 直接发送，等待真实消息
    await sendMessage(text);
  };
  
  return (
    <>
      <input />
      <ImageInput />
    </>
  );
}
```

**简化内容：**
- 移除表情包选择器按钮和弹窗
- 移除乐观更新逻辑
- 保留图片发送功能
- 保留文本输入功能

### 3.3 Hooks 重构

**删除以下文件：**
```
apps/web/src/hooks/useOptimisticMessage.ts
apps/web/src/hooks/useOptimisticMessage.test.ts
apps/web/src/hooks/useEmojiDownload.ts
apps/web/src/hooks/useEmojiDownload.test.ts
```

**在 `apps/web/src/hooks/useMessages.ts` 中简化：**

```typescript
// 移除前：
export function useMessages(conversationId: string) {
  const [optimisticMessages, setOptimisticMessages] = useState([]);
  
  const { data: messages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchMessages(conversationId)
  });
  
  // 合并真实消息和乐观消息
  const allMessages = useMemo(() => {
    return [...messages, ...optimisticMessages].sort(byTimestamp);
  }, [messages, optimisticMessages]);
  
  return { messages: allMessages };
}

// 移除后：
export function useMessages(conversationId: string) {
  const { data: messages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchMessages(conversationId)
  });
  
  return { messages };
}
```

**简化内容：**
- 移除乐观消息状态管理
- 移除消息合并逻辑
- 直接返回服务器数据

### 3.4 WebSocket 客户端简化

**在 `apps/web/src/services/websocket.ts` 中：**

```typescript
// 移除前：
type WebSocketEvent = 
  | { type: 'message:new'; data: Message }
  | { type: 'emoji:downloaded'; data: Emoji }
  | { type: 'emoji:download:progress'; data: { id: string; progress: number } }
  | { type: 'highlight:new'; data: Highlight }
  | { type: 'message:recall'; data: { messageId: string } };

function handleMessage(event: WebSocketEvent) {
  switch (event.type) {
    case 'message:new':
      queryClient.invalidateQueries(['messages']);
      break;
    case 'emoji:downloaded':
      queryClient.invalidateQueries(['emoji', event.data.id]);
      break;
    case 'emoji:download:progress':
      updateDownloadProgress(event.data);
      break;
    // ...
  }
}

// 移除后：
type WebSocketEvent = 
  | { type: 'message:new'; data: Message }
  | { type: 'highlight:new'; data: Highlight }
  | { type: 'message:recall'; data: { messageId: string } };

function handleMessage(event: WebSocketEvent) {
  switch (event.type) {
    case 'message:new':
      queryClient.invalidateQueries(['messages']);
      break;
    case 'highlight:new':
      queryClient.invalidateQueries(['highlights']);
      break;
    case 'message:recall':
      queryClient.invalidateQueries(['messages']);
      break;
  }
}
```

**简化内容：**
- 移除表情包相关事件类型
- 移除下载进度处理逻辑
- 保留核心消息事件

### 3.5 状态管理简化

**在 `apps/web/src/stores/messageStore.ts` 中（如果存在）：**

```typescript
// 移除前：
interface MessageStore {
  messages: Message[];
  optimisticMessages: OptimisticMessage[];
  emojiDownloadProgress: Record<string, number>;
  addOptimisticMessage: (text: string) => string;
  removeOptimisticMessage: (id: string) => void;
  updateEmojiProgress: (id: string, progress: number) => void;
}

// 移除后：
interface MessageStore {
  messages: Message[];
  // 完全移除乐观更新和表情包相关状态
}
```

**简化内容：**
- 移除乐观消息状态
- 移除表情包下载进度状态
- 移除相关的 action 方法
- 仅保留真实消息数据

### 3.6 类型定义清理

**在 `packages/types/src/index.ts` 中：**

```typescript
// 移除以下类型定义：
export interface OptimisticMessage {
  id: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'failed';
}

export interface EmojiDownloadStatus {
  id: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
}

export interface EmojiCache {
  id: string;
  md5: string;
  ossUrl?: string;
  localPath?: string;
  status: string;
}

// 保留以下类型定义：
export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type: number;
  timestamp: number;
  // ...
}
```

**清理内容：**
- 移除乐观消息相关类型
- 移除表情包相关类型
- 保留核心消息类型

---

## 四、数据流与用户体验变更

### 4.1 消息发送流程（文本）

**移除前的流程：**
```
用户输入文本
  ↓
点击发送按钮
  ↓
前端：添加乐观消息（灰色显示）
  ↓
前端：调用 POST /api/conversations/:id/send
  ↓
后端：保存消息到 DataLake + MessageIndex
  ↓
后端：通过 WebSocket 广播 message:new
  ↓
前端：收到真实消息，移除乐观消息
  ↓
UI 更新：显示真实消息
```

**移除后的流程：**
```
用户输入文本
  ↓
点击发送按钮
  ↓
前端：调用 POST /api/conversations/:id/send
  ↓
前端：显示加载状态（按钮禁用）
  ↓
后端：保存消息到 DataLake + MessageIndex
  ↓
后端：通过 WebSocket 广播 message:new
  ↓
前端：收到真实消息
  ↓
UI 更新：显示真实消息，恢复按钮
```

**用户体验变化：**
- 发送后不会立即看到消息
- 需要等待 WebSocket 推送（通常 < 500ms）
- 发送按钮在等待期间禁用
- 失败时不会出现"幽灵消息"

### 4.2 消息发送流程（图片）

**保持不变的流程：**
```
用户选择图片
  ↓
前端：显示图片预览
  ↓
用户确认发送
  ↓
前端：调用 POST /api/conversations/:id/send-image
  ↓
前端：显示上传进度条
  ↓
后端：上传图片到 OSS
  ↓
后端：保存消息到 DataLake + MessageIndex
  ↓
后端：通过 WebSocket 广播 message:new
  ↓
前端：收到真实消息
  ↓
UI 更新：显示图片消息
```

**保留原因：**
- 图片上传需要时间，用户需要看到进度
- 上传失败时需要明确的错误提示
- 图片预览提升用户体验

### 4.3 WebSocket 事件处理简化

**移除前的事件处理：**
```typescript
ws.on('message:new') → 刷新消息列表
ws.on('emoji:downloaded') → 更新表情包缓存
ws.on('emoji:download:progress') → 更新下载进度条
ws.on('highlight:new') → 刷新重要消息 Feed
ws.on('message:recall') → 移除撤回的消息
```

**移除后的事件处理：**
```typescript
ws.on('message:new') → 刷新消息列表
ws.on('highlight:new') → 刷新重要消息 Feed
ws.on('message:recall') → 移除撤回的消息
```

**简化效果：**
- 减少 40% 的事件类型
- 降低前端事件处理复杂度
- 减少不必要的 UI 更新
