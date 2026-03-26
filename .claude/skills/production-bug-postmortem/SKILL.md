---
name: production-bug-postmortem
description: Use after fixing a production bug to analyze test gaps, add missing tests, and document lessons learned. Ensures bugs don't recur by improving test coverage.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TaskCreate, TaskUpdate, TaskList
user-invocable: true
---

# Production Bug Postmortem & Test Gap Analysis

## Overview

当生产环境发现 bug 并修复后，使用此 skill 进行事后分析，找出测试盲区，补充缺失的测试，防止类似问题再次发生。

**核心原则**：Every production bug reveals a test gap. Fix the gap, not just the bug.

## When to Use

- 生产环境发现 bug 并已修复
- 测试通过但线上仍出现问题
- 需要分析为何测试未能发现问题
- 用户说 "分析测试盲区"、"为什么测试没发现"、"补充测试"

## Workflow

```
1. 收集证据
   ├── 生产日志/错误信息
   ├── 真实 API 返回数据
   └── 用户报告的症状

2. 分析测试盲区
   ├── Mock 数据 vs 真实数据
   ├── 边界值覆盖情况
   ├── 集成测试缺失
   └── 数据库约束测试

3. 补充缺失测试
   ├── 使用真实数据格式
   ├── 添加边界值测试
   ├── 添加连续操作测试
   └── 添加约束冲突测试

4. 文档化经验教训
   ├── 创建 postmortem 文档
   ├── 记录测试改进措施
   └── 更新测试最佳实践
```

## Step Details

### 1. 收集证据

**从生产日志提取真实数据**：
```bash
# 查看生产日志
grep "ERROR" /path/to/production.log | tail -20

# 提取 API 返回值
grep "API response" /path/to/production.log | jq '.'
```

**关键信息**：
- 错误堆栈
- API 真实返回格式
- 数据库错误信息
- 用户操作序列

### 2. 分析测试盲区

创建分析文档 `docs/postmortem-<issue-number>-test-gap-analysis.md`：

```markdown
# 测试盲区分析：<Bug 描述>

## 问题回顾
- 线上症状
- 根本原因
- 影响范围

## 测试盲区

### 盲区 1：Mock 数据与真实数据不一致
**测试中的 Mock**：
\`\`\`typescript
mockResolvedValue({ field: 'fake_value' })
\`\`\`

**真实线上返回**：
\`\`\`json
{ "field": 0, "realField": "actual_value" }
\`\`\`

### 盲区 2：边界值未覆盖
- ❌ 缺失：0, null, undefined, "", []
- ✅ 应测试：所有 falsy 值

### 盲区 3：数据库约束未测试
- ❌ 缺失：唯一键冲突、外键约束
- ✅ 应测试：连续操作触发约束

### 盲区 4：集成测试缺失
- ❌ 缺失：真实 API 契约测试
- ✅ 应测试：真实数据格式验证

## 改进建议
[具体的测试改进措施]
```

### 3. 补充缺失测试

**3.1 使用真实数据格式**

从生产日志提取真实返回值：
```typescript
// ❌ 原始测试：假数据
mockResolvedValue({ msgId: 'fake_123' })

// ✅ 改进后：真实数据
const PRODUCTION_RESPONSE = {
  // 从生产日志复制的真实返回值
  msgId: 0,
  newMsgId: '1727263917659712525'
}
mockResolvedValue(PRODUCTION_RESPONSE)
```

**3.2 添加边界值测试**

```typescript
describe('boundary value tests', () => {
  it.each([
    { input: 0, expected: 'use fallback' },
    { input: null, expected: 'use fallback' },
    { input: undefined, expected: 'use fallback' },
    { input: '', expected: 'use fallback' },
  ])('should handle $input correctly', ({ input, expected }) => {
    // 测试边界值
  })
})
```

**3.3 添加连续操作测试**

```typescript
it('should handle consecutive operations without constraint violation', async () => {
  // 第一次操作
  await service.operation('data1')

  // 第二次操作 - 不应该失败
  await expect(
    service.operation('data2')
  ).resolves.not.toThrow()
})
```

**3.4 添加数据库约束测试**

```typescript
it('should throw unique constraint error when inserting duplicate', async () => {
  await db.insert({ id: '123', data: 'test' })

  await expect(
    db.insert({ id: '123', data: 'duplicate' })
  ).rejects.toThrow(/unique constraint/i)
})
```

### 4. 文档化经验教训

**4.1 创建 Postmortem 文档**

文件：`docs/postmortem-<issue-number>-test-gap-analysis.md`

包含：
- 问题回顾
- 测试盲区分析
- 改进建议
- 经验教训
- 改进措施总结表

**4.2 更新测试最佳实践**

如果项目有 `TESTING.md`，更新最佳实践：
```markdown
## 测试最佳实践

### Mock 数据要基于真实数据
- ❌ 不要凭空捏造测试数据
- ✅ 从生产日志/API 文档提取真实格式

### 必须测试边界值
- 0, -1, null, undefined, "", [], {}
- 数据库约束冲突
- 网络超时、API 错误

### 连续操作测试
- 不要只测试单次操作
- 测试连续多次操作
- 测试并发操作
```

## Checklist

完成以下步骤后，此 postmortem 才算完成：

- [ ] 从生产日志提取真实数据
- [ ] 创建测试盲区分析文档
- [ ] 补充边界值测试（使用真实数据格式）
- [ ] 补充连续操作测试
- [ ] 补充数据库约束测试
- [ ] 运行完整测试套件验证
- [ ] 提交测试改进（单独 commit）
- [ ] 在原 issue 上记录 postmortem 链接
- [ ] 更新项目测试最佳实践文档（如果有）

## Output

完成后应产出：

1. **Postmortem 文档**：`docs/postmortem-<issue>-test-gap-analysis.md`
2. **补充的测试**：新增测试用例覆盖盲区
3. **测试通过**：完整测试套件全部通过
4. **Issue 记录**：在原 issue 上添加 postmortem 链接

## Example Usage

```bash
# 用户触发
/production-bug-postmortem

# 或指定 issue
/production-bug-postmortem #15
```

## Integration with Other Skills

- **前置**：通常在 `/github-issue-workflow` 完成修复后使用
- **后续**：postmortem 完成后，可以关闭 issue

## Anti-Patterns

**❌ 不要做**：
- 只修复 bug，不分析测试盲区
- 使用假数据写测试
- 只测试单次操作
- 跳过边界值测试

**✅ 应该做**：
- 从生产日志提取真实数据
- 分析为何测试未发现问题
- 补充缺失的测试覆盖
- 文档化经验教训

## Key Principles

1. **Every production bug reveals a test gap**
2. **Mock must match production reality**
3. **Test boundaries, not just happy paths**
4. **Document lessons for future reference**
5. **Improve the test suite, not just fix the bug**
