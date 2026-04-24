// ABOUTME: SearchService 单元测试，验证统一搜索流程
// ABOUTME: 测试分词、FTS 搜索、结构化过滤和 DataLake 检索的协调

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SearchService } from './searchService.js'
import type { DuckDBService } from './duckdbService.js'
import type { Tokenizer } from './tokenizer.js'
import type { DatabaseService } from './database.js'
import type { DataLakeService } from './dataLake.js'

describe('SearchService', () => {
  let searchService: SearchService
  let mockDuckDB: DuckDBService
  let mockTokenizer: Tokenizer
  let mockDatabase: DatabaseService
  let mockDataLake: DataLakeService

  beforeEach(() => {
    // Mock DuckDBService
    mockDuckDB = {
      searchFTS: vi.fn(),
    } as unknown as DuckDBService

    // Mock Tokenizer
    mockTokenizer = {
      tokenizeAndJoin: vi.fn(),
    } as unknown as Tokenizer

    // Mock DatabaseService
    mockDatabase = {
      prisma: {
        messageIndex: {
          findMany: vi.fn(),
        },
      },
    } as unknown as DatabaseService

    // Mock DataLakeService
    mockDataLake = {
      getMessage: vi.fn(),
    } as unknown as DataLakeService

    searchService = new SearchService(
      mockDuckDB,
      mockTokenizer,
      mockDatabase,
      mockDataLake
    )
  })

  it('should search with keyword only (no filters)', async () => {
    // Arrange
    const query = { q: '你好', type: 'keyword' as const }

    vi.mocked(mockTokenizer.tokenizeAndJoin).mockReturnValue('你好')
    vi.mocked(mockDuckDB.searchFTS).mockResolvedValue([
      {
        msgId: 'msg1',
        contentTokens: '你好 世界',
        createTime: 1000000,
        fromUsername: 'user1',
        toUsername: 'user2',
      },
    ])
    vi.mocked(mockDatabase.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'msg1',
        conversationId: 'conv1',
        dataLakeKey: 'hot/conv1/2025-01-01.jsonl:msg1',
        createTime: 1000000,
        fromUsername: 'user1',
        toUsername: 'user2',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
    ] as never)
    vi.mocked(mockDataLake.getMessage).mockResolvedValue({
      msg_id: 'msg1',
      content: '你好世界',
      create_time: 1000000,
      from_username: 'user1',
      to_username: 'user2',
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      is_chatroom_msg: 0,
      chatroom: '',
      source: '',
    })

    // Act
    const results = await searchService.search(query)

    // Assert
    expect(mockTokenizer.tokenizeAndJoin).toHaveBeenCalledWith('你好')
    expect(mockDuckDB.searchFTS).toHaveBeenCalledWith('你好')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      msgId: 'msg1',
      content: '你好世界',
      createTime: 1000000,
      fromUsername: 'user1',
      toUsername: 'user2',
      conversationId: 'conv1',
    })
  })

  it('should combine keyword search with filters (from: user1)', async () => {
    // Arrange
    const query = { q: '测试', type: 'keyword' as const, from: 'user1' }

    vi.mocked(mockTokenizer.tokenizeAndJoin).mockReturnValue('测试')
    vi.mocked(mockDuckDB.searchFTS).mockResolvedValue([
      { msgId: 'msg1', contentTokens: '测试', createTime: 2000000, fromUsername: 'user1', toUsername: 'user2' },
      { msgId: 'msg2', contentTokens: '测试', createTime: 2000001, fromUsername: 'user3', toUsername: 'user2' },
    ])
    vi.mocked(mockDatabase.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'msg1',
        conversationId: 'conv1',
        dataLakeKey: 'hot/conv1/2025-01-01.jsonl:msg1',
        createTime: 2000000,
        fromUsername: 'user1',
        toUsername: 'user2',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
    ] as never)
    vi.mocked(mockDataLake.getMessage).mockResolvedValue({
      msg_id: 'msg1',
      content: '测试内容',
      create_time: 2000000,
      from_username: 'user1',
      to_username: 'user2',
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      is_chatroom_msg: 0,
      chatroom: '',
      source: '',
    })

    // Act
    const results = await searchService.search(query)

    // Assert
    expect(mockDatabase.prisma.messageIndex.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          msgId: { in: ['msg1', 'msg2'] },
          fromUsername: 'user1',
        }),
      })
    )
    expect(results).toHaveLength(1)
    expect(results[0].fromUsername).toBe('user1')
  })

  it('should handle empty results', async () => {
    // Arrange
    const query = { q: '不存在的词', type: 'keyword' as const }

    vi.mocked(mockTokenizer.tokenizeAndJoin).mockReturnValue('不存在的词')
    vi.mocked(mockDuckDB.searchFTS).mockResolvedValue([])
    vi.mocked(mockDatabase.prisma.messageIndex.findMany).mockResolvedValue([] as never)

    // Act
    const results = await searchService.search(query)

    // Assert
    expect(results).toHaveLength(0)
    expect(mockDataLake.getMessage).not.toHaveBeenCalled()
  })
})
