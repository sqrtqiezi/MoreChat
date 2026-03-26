# 测试盲区分析：为何线上问题未在测试中暴露

## 问题回顾

**线上问题**：`msgId=0` 导致持久化失败，第二条消息触发唯一键冲突
**测试结果**：所有测试通过 ✅，但未发现此问题

---

## 根本原因：Mock 数据与真实数据的差异

### 1. 原始测试的 Mock 数据

```typescript
// apps/server/src/services/juhexbotAdapter.test.ts:136-144
it('should send text message successfully', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({
      errcode: 0,
      data: { msg_id: 'sent_msg_123' }  // ❌ 假数据：非零字符串 ID
    })
  })

  const result = await adapter.sendTextMessage('wxid_target', '你好')
  expect(result).toEqual({ msgId: 'sent_msg_123' })
})
```

**问题**：
- Mock 返回的是 `msg_id: 'sent_msg_123'`（非零字符串）
- 没有模拟真实的 `msgId: 0` 场景
- 没有包含 `newMsgId` 字段

### 2. 真实线上返回格式

```json
{
  "baseResponse": { "ret": 0, "errMsg": {} },
  "count": 1,
  "list": [
    {
      "ret": 0,
      "msgId": 0,                        // ⚠️ 真实数据：占位值 0
      "clientMsgId": 264883882,
      "newMsgId": "1727263917659712525"  // ✅ 真实服务端 ID
    }
  ]
}
```

**关键差异**：
- 真实返回使用 `list[0]` 结构，不是 `data`
- `msgId: 0` 是数字类型的占位值
- 真实 ID 在 `newMsgId` 字段中

---

## 测试盲区分析

### 盲区 1：边界值未覆盖

**缺失的测试场景**：
- ❌ `msgId = 0` 的边界情况
- ❌ `msgId = null` 或 `undefined`
- ❌ 只有 `newMsgId` 没有 `msgId` 的情况

**为什么重要**：
- `msgId: 0` 在 JavaScript 中是 falsy 值，但 `!= null` 检查会通过
- 原始代码 `id != null ? String(id) : undefined` 会把 `0` 转换为 `"0"`

### 盲区 2：数据库约束未测试

**缺失的测试场景**：
- ❌ 连续发送多条消息（触发唯一键冲突）
- ❌ 相同 `msgId` 重复插入的场景
- ❌ Prisma `P2002` 错误处理

**原始测试**：
```typescript
// apps/server/src/services/message.test.ts:264-296
it('should send text message via adapter, persist to DataLake and return msgId', async () => {
  vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({ msgId: 'sent_123' })

  const result = await messageService.sendMessage(conversation.id, '你好')

  expect(result.msgId).toBe('sent_123')
  // ✅ 验证了单条消息成功
  // ❌ 没有测试第二条消息
})
```

**为什么重要**：
- 第一条 `msgId="0"` 写入成功
- 第二条 `msgId="0"` 触发 `Unique constraint failed`
- 单条消息测试无法发现此问题

### 盲区 3：集成测试缺失

**当前测试架构**：
```
单元测试 (Unit Tests)
├── juhexbotAdapter.test.ts  → Mock fetch，不调用真实 API
├── message.test.ts          → Mock adapter，不调用真实 adapter
└── integration.test.ts      → 端到端测试，但也使用 Mock
```

**缺失的测试层**：
- ❌ 真实 API 返回格式的契约测试（Contract Tests）
- ❌ 真实数据库约束的集成测试
- ❌ 生产环境数据回放测试

### 盲区 4：Mock 与真实行为不一致

**问题根源**：
```typescript
// 测试中的 Mock
vi.spyOn(adapter, 'sendTextMessage').mockResolvedValue({
  msgId: 'sent_123'  // ✅ 总是返回有效 ID
})

// 真实 adapter 行为
async sendTextMessage(...) {
  const msgId = this.extractMsgId(result.data)  // ⚠️ 可能返回 "0"
  return { msgId }
}
```

**为什么危险**：
- Mock 隐藏了 `extractMsgId()` 的真实逻辑
- 测试绕过了有 bug 的代码路径
- 给了"一切正常"的假象

---

## 改进建议

### 1. 添加边界值测试

```typescript
it('should prefer newMsgId when msgId is 0', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve({
      baseResponse: { ret: 0, errMsg: {} },
      list: [{
        msgId: 0,                        // ✅ 测试边界值
        newMsgId: '1727263917659712525'
      }]
    })
  })

  const result = await adapter.sendTextMessage('wxid_target', 'test')
  expect(result.msgId).toBe('1727263917659712525')  // ✅ 验证使用了 newMsgId
})
```

### 2. 添加数据库约束测试

```typescript
it('should handle consecutive messages without unique constraint violation', async () => {
  vi.spyOn(adapter, 'sendTextMessage')
    .mockResolvedValueOnce({ msgId: '1727263917659712525' })
    .mockResolvedValueOnce({ msgId: '1727263917659712526' })

  // 发送第一条消息
  await messageService.sendMessage(conversation.id, '第一条')

  // 发送第二条消息 - 不应该抛出唯一键冲突错误
  await expect(
    messageService.sendMessage(conversation.id, '第二条')
  ).resolves.not.toThrow()
})
```

### 3. 添加 API 契约测试

```typescript
describe('API Contract Tests', () => {
  it('should match production /msg/send_text response format', async () => {
    // 使用真实 API 返回的 JSON schema 验证
    const response = await adapter.sendTextMessage('wxid_target', 'test')

    expect(response).toMatchObject({
      baseResponse: { ret: expect.any(Number) },
      list: expect.arrayContaining([
        expect.objectContaining({
          msgId: expect.any(Number),
          newMsgId: expect.any(String)
        })
      ])
    })
  })
})
```

### 4. 使用真实数据回放

```typescript
// 从生产日志中提取真实返回值
const PRODUCTION_RESPONSE = {
  baseResponse: { ret: 0, errMsg: {} },
  count: 1,
  list: [{
    ret: 0,
    msgId: 0,
    clientMsgId: 264883882,
    createTime: 1774363517,
    serverTime: 1774363517,
    type: 1,
    newMsgId: '1727263917659712525'
  }]
}

it('should handle production response format', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(PRODUCTION_RESPONSE)
  })

  const result = await adapter.sendTextMessage('wxid_target', 'test')
  expect(result.msgId).toBe('1727263917659712525')
})
```

---

## 经验教训

### 1. Mock 要基于真实数据

**❌ 错误做法**：
```typescript
mockResolvedValue({ msgId: 'fake_id_123' })  // 凭空捏造的数据
```

**✅ 正确做法**：
```typescript
// 从生产日志/API 文档中提取真实格式
const REAL_API_RESPONSE = { /* 真实返回值 */ }
mockResolvedValue(REAL_API_RESPONSE)
```

### 2. 测试要覆盖边界值

**关键边界值**：
- `0`, `-1`, `null`, `undefined`, `""`, `[]`, `{}`
- 数据库唯一键冲突
- 网络超时、API 错误

### 3. 集成测试不能全靠 Mock

**测试金字塔**：
```
       /\
      /  \  E2E Tests (少量，真实环境)
     /____\
    /      \  Integration Tests (适量，真实 DB + Mock API)
   /________\
  /          \  Unit Tests (大量，Mock 一切)
 /____________\
```

### 4. 生产问题要补充测试

**流程**：
1. 生产环境发现 bug
2. 提取真实数据（日志、API 返回）
3. 写失败测试（RED）
4. 修复代码（GREEN）
5. 重构优化（REFACTOR）
6. **补充边界值测试，防止回归**

---

## 总结

| 测试盲区 | 原因 | 改进措施 |
|---------|------|---------|
| Mock 数据不真实 | 使用假的 `msg_id: 'sent_123'` | 使用生产日志中的真实返回格式 |
| 边界值未覆盖 | 没有测试 `msgId: 0` | 添加边界值测试（0, null, undefined） |
| 数据库约束未测试 | 只测试单条消息 | 测试连续发送多条消息 |
| 集成测试缺失 | 全部使用 Mock | 添加真实 DB + 真实 API 的集成测试 |

**核心教训**：**Mock 要基于真实数据，测试要覆盖边界值，生产问题要补充测试。**