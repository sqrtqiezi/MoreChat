// ABOUTME: 测试 DuckDB 服务的连接管理、FTS schema 初始化和查询功能
// ABOUTME: 验证 FTS 记录的插入、搜索和幂等性

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DuckDBService } from './duckdbService.js'
import { unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'

describe('DuckDBService', () => {
  const testDbPath = '/Users/niujin/develop/MoreChat/apps/server/test-search.duckdb'
  let service: DuckDBService

  afterEach(async () => {
    if (service) {
      await service.close()
    }

    // 清理测试数据库文件
    if (existsSync(testDbPath)) {
      await unlink(testDbPath)
    }
    if (existsSync(`${testDbPath}.wal`)) {
      await unlink(`${testDbPath}.wal`)
    }
  })

  it('should connect and initialize schema', async () => {
    service = new DuckDBService({ dbPath: testDbPath })
    await service.initialize()

    // 验证 message_fts 表存在
    const result = await service.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'message_fts'"
    )
    expect(result.length).toBe(1)
    expect(result[0].table_name).toBe('message_fts')
  })

  it('should insert and query FTS data', async () => {
    service = new DuckDBService({ dbPath: testDbPath })
    await service.initialize()

    await service.insertFTS({
      msgId: 'msg001',
      contentTokens: '你好 世界 测试',
      createTime: 1700000000,
      fromUsername: 'user_a',
      toUsername: 'user_b',
    })

    const results = await service.searchFTS('你好')
    expect(results.length).toBe(1)
    expect(results[0].msgId).toBe('msg001')
    expect(results[0].contentTokens).toBe('你好 世界 测试')
    expect(results[0].createTime).toBe(1700000000)
    expect(results[0].fromUsername).toBe('user_a')
    expect(results[0].toUsername).toBe('user_b')
  })

  it('should handle duplicate msgId gracefully', async () => {
    service = new DuckDBService({ dbPath: testDbPath })
    await service.initialize()

    const record = {
      msgId: 'msg_dup',
      contentTokens: '重复 消息',
      createTime: 1700000001,
      fromUsername: 'user_a',
      toUsername: 'user_b',
    }

    // 插入两次，不应抛出错误
    await service.insertFTS(record)
    await expect(service.insertFTS(record)).resolves.not.toThrow()

    // 只有一条记录
    const results = await service.searchFTS('重复')
    expect(results.length).toBe(1)
  })

  it('should return empty for no matches', async () => {
    service = new DuckDBService({ dbPath: testDbPath })
    await service.initialize()

    await service.insertFTS({
      msgId: 'msg002',
      contentTokens: '你好 世界',
      createTime: 1700000002,
      fromUsername: 'user_a',
      toUsername: 'user_b',
    })

    const results = await service.searchFTS('不存在的关键词xyz')
    expect(results.length).toBe(0)
  })
})
