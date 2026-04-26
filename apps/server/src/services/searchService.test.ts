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
        messageTag: {
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

  it('should filter keyword results to important messages when important is true', async () => {
    // Arrange
    const query = { q: '重要', type: 'keyword' as const, important: true }

    vi.mocked(mockTokenizer.tokenizeAndJoin).mockReturnValue('重要')
    vi.mocked(mockDuckDB.searchFTS).mockResolvedValue([
      { msgId: 'msg1', contentTokens: '重要', createTime: 3000000, fromUsername: 'user1', toUsername: 'user2' },
      { msgId: 'msg2', contentTokens: '重要', createTime: 3000001, fromUsername: 'user3', toUsername: 'user4' },
    ])
    vi.mocked(mockDatabase.prisma.messageTag.findMany).mockResolvedValue([
      { msgId: 'msg2' },
    ] as never)
    vi.mocked(mockDatabase.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'msg2',
        conversationId: 'conv2',
        dataLakeKey: 'hot/conv2/2025-01-01.jsonl:msg2',
        createTime: 3000001,
        fromUsername: 'user3',
        toUsername: 'user4',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
    ] as never)
    vi.mocked(mockDataLake.getMessage).mockResolvedValue({
      msg_id: 'msg2',
      content: '真正重要的内容',
      create_time: 3000001,
      from_username: 'user3',
      to_username: 'user4',
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
    expect(mockDatabase.prisma.messageTag.findMany).toHaveBeenCalledWith({
      where: {
        msgId: { in: ['msg1', 'msg2'] },
        tag: 'important',
      },
      select: { msgId: true },
    })
    expect(mockDatabase.prisma.messageIndex.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          msgId: { in: ['msg2'] },
        }),
      })
    )
    expect(results).toEqual([
      {
        msgId: 'msg2',
        content: '真正重要的内容',
        createTime: 3000001,
        fromUsername: 'user3',
        toUsername: 'user4',
        conversationId: 'conv2',
      },
    ])
  })
})

describe('SearchService - Semantic Search', () => {
  let searchService: SearchService
  let mockDuckDB: DuckDBService
  let mockTokenizer: Tokenizer
  let mockDatabase: DatabaseService
  let mockDataLake: DataLakeService
  let mockEmbedding: { generateEmbedding: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockDuckDB = {
      searchFTS: vi.fn(),
      searchVector: vi.fn(),
    } as unknown as DuckDBService

    mockTokenizer = {
      tokenizeAndJoin: vi.fn(),
    } as unknown as Tokenizer

    mockDatabase = {
      prisma: {
        messageIndex: {
          findMany: vi.fn(),
        },
        messageTag: {
          findMany: vi.fn(),
        },
      },
    } as unknown as DatabaseService

    mockDataLake = {
      getMessage: vi.fn(),
    } as unknown as DataLakeService

    mockEmbedding = {
      generateEmbedding: vi.fn(),
    }

    searchService = new SearchService(
      mockDuckDB,
      mockTokenizer,
      mockDatabase,
      mockDataLake,
      mockEmbedding as any
    )
  })

  it('falls back to keyword search when semantic search is requested without EmbeddingService', async () => {
    // Arrange
    const serviceWithoutEmbedding = new SearchService(
      mockDuckDB,
      mockTokenizer,
      mockDatabase,
      mockDataLake
    )
    const query = { q: '测试', type: 'semantic' as const }
    vi.mocked(mockTokenizer.tokenizeAndJoin).mockReturnValue('测试')
    vi.mocked(mockDuckDB.searchFTS).mockResolvedValue([
      { msgId: 'msg1', contentTokens: '测试', createTime: 1000000, fromUsername: 'user1', toUsername: 'user2' },
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
      content: '测试内容',
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
    const results = await serviceWithoutEmbedding.search(query)

    // Assert
    expect(mockTokenizer.tokenizeAndJoin).toHaveBeenCalledWith('测试')
    expect(mockDuckDB.searchFTS).toHaveBeenCalledWith('测试')
    expect(mockDuckDB.searchVector).not.toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0]?.msgId).toBe('msg1')
  })

  it('should perform semantic search using vector embeddings', async () => {
    // Arrange
    const query = { q: '如何使用 AI', type: 'semantic' as const }
    const mockEmbeddingVector = [0.1, 0.2, 0.3]

    mockEmbedding.generateEmbedding.mockResolvedValue(mockEmbeddingVector)
    vi.mocked(mockDuckDB.searchVector).mockResolvedValue([
      { msgId: 'msg1', distance: 0.1, createTime: 1000000 },
      { msgId: 'msg2', distance: 0.2, createTime: 1000001 },
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
      content: 'AI 可以帮助你提高效率',
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
    expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('如何使用 AI')
    expect(mockDuckDB.searchVector).toHaveBeenCalledWith(mockEmbeddingVector, 20)
    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('AI 可以帮助你提高效率')
  })

  it('preserves semantic relevance order after index filtering and pagination', async () => {
    const query = { q: '如何使用 AI', type: 'semantic' as const, limit: 2, offset: 1 }
    const mockEmbeddingVector = [0.1, 0.2, 0.3]

    mockEmbedding.generateEmbedding.mockResolvedValue(mockEmbeddingVector)
    vi.mocked(mockDuckDB.searchVector).mockResolvedValue([
      { msgId: 'msg3', distance: 0.05, createTime: 1000002 },
      { msgId: 'msg1', distance: 0.1, createTime: 1000000 },
      { msgId: 'msg2', distance: 0.15, createTime: 1000001 },
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
      {
        msgId: 'msg2',
        conversationId: 'conv1',
        dataLakeKey: 'hot/conv1/2025-01-01.jsonl:msg2',
        createTime: 1000001,
        fromUsername: 'user2',
        toUsername: 'user3',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
      {
        msgId: 'msg3',
        conversationId: 'conv2',
        dataLakeKey: 'hot/conv2/2025-01-01.jsonl:msg3',
        createTime: 1000002,
        fromUsername: 'user3',
        toUsername: 'user4',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
    ] as never)
    vi.mocked(mockDataLake.getMessage)
      .mockResolvedValueOnce({
        msg_id: 'msg1',
        content: '语义结果 1',
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
      .mockResolvedValueOnce({
        msg_id: 'msg2',
        content: '语义结果 2',
        create_time: 1000001,
        from_username: 'user2',
        to_username: 'user3',
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: '',
      })

    const results = await searchService.search(query)

    expect(mockDuckDB.searchVector).toHaveBeenCalledWith(mockEmbeddingVector, 3)
    expect(results.map((result) => result.msgId)).toEqual(['msg1', 'msg2'])
  })

  it('should support hybrid search combining FTS and vector results', async () => {
    // Arrange
    const query = { q: '测试', type: 'hybrid' as const }
    const mockEmbeddingVector = [0.1, 0.2, 0.3]

    vi.mocked(mockTokenizer.tokenizeAndJoin).mockReturnValue('测试')
    vi.mocked(mockDuckDB.searchFTS).mockResolvedValue([
      { msgId: 'msg1', contentTokens: '测试', createTime: 1000000, fromUsername: 'user1', toUsername: 'user2' },
    ])
    mockEmbedding.generateEmbedding.mockResolvedValue(mockEmbeddingVector)
    vi.mocked(mockDuckDB.searchVector).mockResolvedValue([
      { msgId: 'msg2', distance: 0.1, createTime: 1000001 },
      { msgId: 'msg3', distance: 0.2, createTime: 1000002 },
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
      {
        msgId: 'msg2',
        conversationId: 'conv1',
        dataLakeKey: 'hot/conv1/2025-01-01.jsonl:msg2',
        createTime: 1000001,
        fromUsername: 'user1',
        toUsername: 'user2',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
    ] as never)
    vi.mocked(mockDataLake.getMessage)
      .mockResolvedValueOnce({
        msg_id: 'msg1',
        content: '测试内容1',
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
      .mockResolvedValueOnce({
        msg_id: 'msg2',
        content: '测试内容2',
        create_time: 1000001,
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
    expect(mockTokenizer.tokenizeAndJoin).toHaveBeenCalledWith('测试')
    expect(mockDuckDB.searchFTS).toHaveBeenCalledWith('测试')
    expect(mockEmbedding.generateEmbedding).toHaveBeenCalledWith('测试')
    expect(mockDuckDB.searchVector).toHaveBeenCalledWith(mockEmbeddingVector, 20)
    expect(mockDatabase.prisma.messageIndex.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          msgId: { in: ['msg1', 'msg2', 'msg3'] },
        }),
      })
    )
    expect(results).toHaveLength(2)
  })

  it('preserves hybrid ranking order while filtering to important messages', async () => {
    const query = { q: '测试', type: 'hybrid' as const, important: true, limit: 2, offset: 0 }
    const mockEmbeddingVector = [0.1, 0.2, 0.3]

    vi.mocked(mockTokenizer.tokenizeAndJoin).mockReturnValue('测试')
    vi.mocked(mockDuckDB.searchFTS).mockResolvedValue([
      { msgId: 'msg1', contentTokens: '测试', createTime: 1000000, fromUsername: 'user1', toUsername: 'user2' },
      { msgId: 'msg2', contentTokens: '测试', createTime: 1000001, fromUsername: 'user2', toUsername: 'user3' },
    ])
    mockEmbedding.generateEmbedding.mockResolvedValue(mockEmbeddingVector)
    vi.mocked(mockDuckDB.searchVector).mockResolvedValue([
      { msgId: 'msg3', distance: 0.1, createTime: 1000002 },
      { msgId: 'msg2', distance: 0.2, createTime: 1000001 },
    ])
    vi.mocked(mockDatabase.prisma.messageTag.findMany).mockResolvedValue([
      { msgId: 'msg2' },
      { msgId: 'msg3' },
    ] as never)
    vi.mocked(mockDatabase.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'msg2',
        conversationId: 'conv1',
        dataLakeKey: 'hot/conv1/2025-01-01.jsonl:msg2',
        createTime: 1000001,
        fromUsername: 'user2',
        toUsername: 'user3',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
      {
        msgId: 'msg3',
        conversationId: 'conv2',
        dataLakeKey: 'hot/conv2/2025-01-01.jsonl:msg3',
        createTime: 1000002,
        fromUsername: 'user3',
        toUsername: 'user4',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
    ] as never)
    vi.mocked(mockDataLake.getMessage)
      .mockResolvedValueOnce({
        msg_id: 'msg2',
        content: '重要结果 2',
        create_time: 1000001,
        from_username: 'user2',
        to_username: 'user3',
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: '',
      })
      .mockResolvedValueOnce({
        msg_id: 'msg3',
        content: '重要结果 3',
        create_time: 1000002,
        from_username: 'user3',
        to_username: 'user4',
        msg_type: 1,
        chatroom_sender: '',
        desc: '',
        is_chatroom_msg: 0,
        chatroom: '',
        source: '',
      })

    const results = await searchService.search(query)

    expect(mockDatabase.prisma.messageTag.findMany).toHaveBeenCalledWith({
      where: {
        msgId: { in: ['msg1', 'msg2', 'msg3'] },
        tag: 'important',
      },
      select: { msgId: true },
    })
    expect(results.map((result) => result.msgId)).toEqual(['msg2', 'msg3'])
  })

  it('falls back to keyword search when hybrid search is requested without EmbeddingService', async () => {
    // Arrange
    const serviceWithoutEmbedding = new SearchService(
      mockDuckDB,
      mockTokenizer,
      mockDatabase,
      mockDataLake
    )
    const query = { q: '混合测试', type: 'hybrid' as const }

    vi.mocked(mockTokenizer.tokenizeAndJoin).mockReturnValue('混合测试')
    vi.mocked(mockDuckDB.searchFTS).mockResolvedValue([
      { msgId: 'msg2', contentTokens: '混合测试', createTime: 1000001, fromUsername: 'user3', toUsername: 'user4' },
    ])
    vi.mocked(mockDatabase.prisma.messageIndex.findMany).mockResolvedValue([
      {
        msgId: 'msg2',
        conversationId: 'conv2',
        dataLakeKey: 'hot/conv2/2025-01-01.jsonl:msg2',
        createTime: 1000001,
        fromUsername: 'user3',
        toUsername: 'user4',
        msgType: 1,
        isChatroomMsg: 0,
        chatroom: null,
        chatroomSender: null,
      },
    ] as never)
    vi.mocked(mockDataLake.getMessage).mockResolvedValue({
      msg_id: 'msg2',
      content: '混合回退结果',
      create_time: 1000001,
      from_username: 'user3',
      to_username: 'user4',
      msg_type: 1,
      chatroom_sender: '',
      desc: '',
      is_chatroom_msg: 0,
      chatroom: '',
      source: '',
    })

    // Act
    const results = await serviceWithoutEmbedding.search(query)

    // Assert
    expect(mockTokenizer.tokenizeAndJoin).toHaveBeenCalledWith('混合测试')
    expect(mockDuckDB.searchFTS).toHaveBeenCalledWith('混合测试')
    expect(mockDuckDB.searchVector).not.toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0]?.msgId).toBe('msg2')
  })
})
