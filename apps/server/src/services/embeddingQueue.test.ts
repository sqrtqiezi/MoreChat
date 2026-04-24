// ABOUTME: Tests for EmbeddingQueue that processes vector generation tasks asynchronously
// ABOUTME: Verifies queue behavior, error handling, and graceful degradation

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EmbeddingQueue } from './embeddingQueue.js'
import type { EmbeddingService } from './embeddingService.js'
import type { DuckDBService } from './duckdbService.js'
import { logger } from '../lib/logger.js'

vi.mock('../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('EmbeddingQueue', () => {
  let mockEmbeddingService: EmbeddingService
  let mockDuckDBService: DuckDBService
  let queue: EmbeddingQueue

  beforeEach(() => {
    mockEmbeddingService = {
      generateEmbedding: vi.fn(),
    } as unknown as EmbeddingService

    mockDuckDBService = {
      insertVector: vi.fn(),
    } as unknown as DuckDBService

    queue = new EmbeddingQueue(mockEmbeddingService, mockDuckDBService)
  })

  it('should enqueue and process messages', async () => {
    const mockEmbedding = new Array(512).fill(0.1)
    vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValue(mockEmbedding)
    vi.mocked(mockDuckDBService.insertVector).mockResolvedValue(undefined)

    queue.enqueue({
      msgId: 'msg1',
      content: 'Hello world',
      createTime: 1234567890,
    })

    await queue.waitForIdle()

    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('Hello world')
    expect(mockDuckDBService.insertVector).toHaveBeenCalledWith({
      msgId: 'msg1',
      embedding: mockEmbedding,
      createTime: 1234567890,
    })
  })

  it('should handle empty content', async () => {
    queue.enqueue({
      msgId: 'msg2',
      content: '',
      createTime: 1234567890,
    })

    await queue.waitForIdle()

    expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled()
    expect(mockDuckDBService.insertVector).not.toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    vi.mocked(mockEmbeddingService.generateEmbedding).mockRejectedValue(new Error('API error'))

    queue.enqueue({
      msgId: 'msg3',
      content: 'Test content',
      createTime: 1234567890,
    })

    await queue.waitForIdle()

    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('Test content')
    expect(mockDuckDBService.insertVector).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalled()
  })

  it('should report queue size', () => {
    queue.enqueue({
      msgId: 'msg4',
      content: 'Test 1',
      createTime: 1234567890,
    })

    queue.enqueue({
      msgId: 'msg5',
      content: 'Test 2',
      createTime: 1234567891,
    })

    expect(queue.getQueueSize()).toBeGreaterThan(0)
  })
})
