# 过滤类型51消息实施计划

## 概述
在后端数据库层过滤类型51的系统操作消息，避免在聊天界面显示。

## 设计文档
参考：`docs/superpowers/specs/2026-03-23-filter-type51-messages-design.md`

## 实施步骤

### 步骤1：修改数据库服务
**文件：** `apps/server/src/services/database.ts`

**修改位置：** `getMessageIndexes` 方法（第441-451行）

**修改内容：**
在 `where` 条件中添加 `msgType: { not: 51 }`

**修改前：**
```typescript
return this.prisma.messageIndex.findMany({
  where: {
    conversationId,
    ...(before ? { createTime: { lt: before } } : {})
  },
  orderBy: { createTime: 'desc' },
  take: limit
})
```

**修改后：**
```typescript
return this.prisma.messageIndex.findMany({
  where: {
    conversationId,
    msgType: { not: 51 },
    ...(before ? { createTime: { lt: before } } : {})
  },
  orderBy: { createTime: 'desc' },
  take: limit
})
```

### 步骤2：更新测试
**文件：** `apps/server/src/services/database.test.ts`

**需要验证：**
1. 类型51的消息被正确过滤
2. 其他类型消息不受影响
3. 分页功能正常工作

**测试用例：**
- 创建包含类型51消息的测试数据
- 调用 `getMessageIndexes`
- 验证返回结果不包含类型51消息

### 步骤3：运行测试
```bash
cd apps/server
npx vitest run src/services/database.test.ts
```

### 步骤4：手动验证
1. 启动开发服务器
2. 打开有大量类型51消息的会话
3. 验证界面不再显示这些消息
4. 验证分页加载正常

## 验收标准
- [ ] 数据库查询正确过滤类型51消息
- [ ] 所有相关测试通过
- [ ] 聊天界面不再显示类型51消息
- [ ] 分页功能正常工作
- [ ] 其他类型消息显示正常

## 回滚方案
如果出现问题，移除 `msgType: { not: 51 }` 条件即可。
