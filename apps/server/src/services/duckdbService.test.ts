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

  describe('Vector Search', () => {
    it('should insert and search vectors', async () => {
      service = new DuckDBService({ dbPath: testDbPath })
      await service.initialize()

      // 插入向量记录
      const embedding1 = new Array(512).fill(0).map((_, i) => i / 512)
      const embedding2 = new Array(512).fill(0).map((_, i) => (511 - i) / 512)

      await service.insertVector({
        msgId: 'vec001',
        embedding: embedding1,
        createTime: 1700000010,
      })

      await service.insertVector({
        msgId: 'vec002',
        embedding: embedding2,
        createTime: 1700000020,
      })

      // 搜索向量
      const results = await service.searchVector(embedding1, 2)
      expect(results.length).toBe(2)
      expect(results[0].msgId).toBe('vec001')
      expect(results[0].distance).toBeLessThan(0.01)
    })

    it('should handle duplicate vector msgId gracefully', async () => {
      service = new DuckDBService({ dbPath: testDbPath })
      await service.initialize()

      const embedding = new Array(512).fill(0.5)
      const record = {
        msgId: 'vec_dup',
        embedding,
        createTime: 1700000030,
      }

      await service.insertVector(record)
      await expect(service.insertVector(record)).resolves.not.toThrow()

      const results = await service.searchVector(embedding, 10)
      expect(results.filter((r) => r.msgId === 'vec_dup').length).toBe(1)
    })

    it('should return top K results ordered by distance', async () => {
      service = new DuckDBService({ dbPath: testDbPath })
      await service.initialize()

      const queryVector = new Array(512).fill(0).map((_, i) => i / 512)

      for (let i = 0; i < 5; i++) {
        const embedding = new Array(512).fill(0).map((_, j) => (j + i * 10) / 512)
        await service.insertVector({
          msgId: `vec_${i}`,
          embedding,
          createTime: 1700000000 + i,
        })
      }

      const results = await service.searchVector(queryVector, 3)
      expect(results.length).toBe(3)
      expect(results[0].distance).toBeLessThanOrEqual(results[1].distance)
      expect(results[1].distance).toBeLessThanOrEqual(results[2].distance)
    })
  })
})
