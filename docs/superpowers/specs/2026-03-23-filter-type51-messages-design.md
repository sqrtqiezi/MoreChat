---
name: 过滤类型51消息
description: 在后端数据库层过滤类型51的系统操作消息，避免在聊天界面显示
type: feature
---

# 过滤类型51消息设计文档

## 问题背景

用户反馈聊天界面中显示了大量"音频通话"消息，经调查发现：

- 数据库中有 21,023 条类型51的消息
- 这些消息实际上不是真正的音频/视频通话
- 而是微信内部的同步操作消息，包括：
  - 群聊同步操作（op id='2' 或 '5'）：`lastMessage` 操作
  - 文件下载操作（op id='11'）：`DownloadFile` 操作

### 消息内容示例

```xml
<msg>
<op id='5'>
<username>38733837988@chatroom</username>
<name>lastMessage</name>
<arg>{"messageSvrId":"8673564400556678374"}</arg>
</op>
</msg>
```

这些消息对用户没有实际意义，应该被过滤掉。

## 设计方案

### 过滤位置

在后端数据库查询层过滤，具体位置：
- `apps/server/src/services/database.ts` 的 `getMessageIndexes` 方法
- 添加 `WHERE msgType != 51` 条件

### 为什么选择数据库层过滤

**优点：**
1. 效率最高 - 数据库层面就过滤，减少不必要的数据读取
2. 分页逻辑不受影响 - 返回的都是有效消息
3. 统一处理 - 所有查询消息的地方都自动生效
4. 减少网络传输 - 不需要传输无用数据到前端

**替代方案对比：**
- 前端过滤：会影响分页逻辑，用户可能看到"加载更多"但没有新消息
- 服务层过滤：需要多取数据来保证返回足够的消息，效率较低

## 实现细节

### 修改文件

1. **apps/server/src/services/database.ts**
   - 修改 `getMessageIndexes` 方法
   - 添加 SQL 条件：`AND msgType != 51`

### SQL 查询变更

**修改前：**
```sql
SELECT * FROM MessageIndex
WHERE conversationId = ?
AND createTime < ?
ORDER BY createTime DESC
LIMIT ?
```

**修改后：**
```sql
SELECT * FROM MessageIndex
WHERE conversationId = ?
AND createTime < ?
AND msgType != 51
ORDER BY createTime DESC
LIMIT ?
```

## 测试策略

1. **单元测试**
   - 验证 `getMessageIndexes` 正确过滤类型51消息
   - 验证其他类型消息不受影响

2. **集成测试**
   - 验证消息列表API不返回类型51消息
   - 验证分页功能正常工作

3. **手动测试**
   - 在有大量类型51消息的会话中测试
   - 验证界面不再显示这些消息

## 影响范围

### 受影响的功能
- 消息列表查询
- 消息分页加载

### 不受影响的功能
- 消息发送
- 图片消息
- 其他类型消息的显示

## 回滚方案

如果发现过滤导致问题，可以：
1. 移除 `AND msgType != 51` 条件
2. 重新部署

## 未来扩展

如果将来需要支持"显示/隐藏系统消息"的开关：
1. 在数据库查询中添加可选参数
2. 前端添加设置选项
3. 根据用户设置决定是否过滤
