# 测试数据说明

## 已生成的测试数据

运行 `pnpm db:seed` 后，已在数据库中创建以下测试数据：

### 📊 数据统计

- **客户端**: 1 个（在线状态）
- **联系人**: 6 个
- **群组**: 2 个
- **会话**: 6 个（4 个私聊 + 2 个群聊）
- **消息**: 17 条

### 👥 联系人列表

1. **我** (wxid_test_user) - 当前用户
2. **张小美** (wxid_alice) - 有 3 条未读消息
3. **李明** (wxid_bob)
4. **王强** (wxid_charlie) - 有 1 条未读消息
5. **赵敏** (wxid_david)
6. **孙悟空** (wxid_eve)

### 💬 会话列表

#### 私聊会话

1. **张小美** - 5 条消息，3 条未读，最后消息：5分钟前
   - 聊天内容：周末爬山约定

2. **李明** - 2 条消息，0 条未读，最后消息：30分钟前
   - 聊天内容：会议时间变更通知

3. **王强** - 1 条消息，1 条未读，最后消息：2小时前
   - 聊天内容：代码审查询问

4. **赵敏** - 2 条消息，0 条未读，最后消息：1天前
   - 聊天内容：项目文档更新

#### 群聊会话

1. **技术交流群** - 5 条消息，5 条未读，最后消息：10分钟前
   - 聊天内容：讨论 React 19 新特性
   - 成员：张小美、李明、我、王强

2. **周末爬山群** - 2 条消息，0 条未读，最后消息：3小时前
   - 聊天内容：讨论爬山地点
   - 成员：孙悟空、我

## 🚀 如何使用

### 1. 生成测试数据

```bash
cd apps/server
pnpm db:seed
```

### 2. 启动后端服务

```bash
cd apps/server
pnpm dev
```

后端将运行在 http://localhost:3100

### 3. 启动前端服务

```bash
cd apps/web
pnpm dev
```

前端将运行在 http://localhost:3000

### 4. 登录测试

- 访问 http://localhost:3000
- 输入任意用户名和密码（例如：用户名 `test`，密码 `123456`）
- 登录后即可看到会话列表和消息

## 🔄 重新生成数据

如果需要重新生成测试数据：

```bash
# 删除数据库
rm apps/server/data/morechat.db

# 重新生成数据
cd apps/server
pnpm db:push
pnpm db:seed
```

## 📝 数据存储位置

- **数据库**: `apps/server/data/morechat.db` (SQLite)
- **消息内容**: `apps/server/data/lake/` (DataLake 文件系统)

## 🎯 测试场景

使用这些测试数据，你可以验证以下功能：

### ✅ 会话列表
- 显示所有会话（私聊 + 群聊）
- 显示最后消息预览
- 显示相对时间（5分钟前、30分钟前等）
- 显示未读消息数徽章
- 点击会话切换

### ✅ 聊天窗口
- 显示历史消息
- 消息左右对齐（自己的消息靠右）
- 虚拟滚动
- 自动滚动到底部

### ✅ 发送消息
- 输入文本消息
- Enter 发送
- Shift+Enter 换行
- Esc 清空输入

### ✅ 实时更新
- WebSocket 连接状态
- 新消息推送（需要后端支持）

## 🐛 故障排查

### 问题：会话列表为空

**解决方案**：
1. 确认后端服务正在运行
2. 检查数据库文件是否存在：`ls apps/server/data/morechat.db`
3. 重新运行 `pnpm db:seed`

### 问题：消息列表为空

**解决方案**：
1. 检查 DataLake 目录：`ls apps/server/data/lake/`
2. 确认消息文件已创建
3. 重新运行 `pnpm db:seed`

### 问题：后端报错 "Could not check juhexbot status"

**说明**：这是正常的警告，因为没有真实的 juhexbot 连接。不影响测试数据的使用。

## 📚 相关文档

- [Phase 3 设计文档](../../docs/plans/2026-03-09-phase3-frontend-mvp-design.md)
- [Phase 3 实现计划](../../docs/plans/2026-03-09-phase3-frontend-mvp-implementation.md)
