// ABOUTME: Tests for SemanticImportanceService that classifies messages using prototype similarity
// ABOUTME: Uses mocked embeddings to verify cosine similarity threshold logic

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SemanticImportanceService } from './semanticImportanceService.js'
import type { EmbeddingService } from './embeddingService.js'

describe('SemanticImportanceService', () => {
  let mockEmbeddingService: EmbeddingService
  let service: SemanticImportanceService

  beforeEach(() => {
    mockEmbeddingService = {
      initialize: vi.fn(),
      generateEmbedding: vi.fn(),
      generateBatchEmbeddings: vi.fn(),
    } as any

    service = new SemanticImportanceService(mockEmbeddingService)
  })

  it('should throw error when analyze() called before initialize()', async () => {
    await expect(service.analyze('测试消息')).rejects.toThrow(
      'SemanticImportanceService not initialized'
    )
  })

  it('should detect todo messages above threshold', async () => {
    // Mock prototype embeddings during initialization
    vi.mocked(mockEmbeddingService.generateBatchEmbeddings).mockResolvedValueOnce([
      [1, 0, 0, 0], // todo prototype
      [0, 1, 0, 0], // decision prototype
      [0, 0, 1, 0], // question prototype
      [0, 0, 0, 1], // important prototype
    ])

    await service.initialize()

    // Mock message embedding that matches todo prototype (cosine similarity = 0.9)
    vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValueOnce([0.9, 0.1, 0, 0])

    const tags = await service.analyze('请今天完成这个任务')

    expect(tags).toHaveLength(1)
    expect(tags[0]).toEqual({
      tag: 'todo',
      source: 'ai:semantic',
    })
  })

  it('should detect decision messages above threshold', async () => {
    vi.mocked(mockEmbeddingService.generateBatchEmbeddings).mockResolvedValueOnce([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ])

    await service.initialize()

    // Mock message embedding that matches decision prototype (cosine similarity = 0.85)
    vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValueOnce([0.1, 0.85, 0.05, 0])

    const tags = await service.analyze('我们决定采用这个方案')

    expect(tags).toHaveLength(1)
    expect(tags[0]).toEqual({
      tag: 'decision',
      source: 'ai:semantic',
    })
  })

  it('should detect question messages above threshold', async () => {
    vi.mocked(mockEmbeddingService.generateBatchEmbeddings).mockResolvedValueOnce([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ])

    await service.initialize()

    // Mock message embedding that matches question prototype (cosine similarity = 0.83)
    vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValueOnce([0, 0.05, 0.83, 0.12])

    const tags = await service.analyze('这个问题你怎么看')

    expect(tags).toHaveLength(1)
    expect(tags[0]).toEqual({
      tag: 'question',
      source: 'ai:semantic',
    })
  })

  it('should detect important messages above threshold', async () => {
    vi.mocked(mockEmbeddingService.generateBatchEmbeddings).mockResolvedValueOnce([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ])

    await service.initialize()

    // Mock message embedding that matches important prototype (cosine similarity = 0.9)
    vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValueOnce([0, 0, 0.1, 0.9])

    const tags = await service.analyze('这个信息非常重要请注意')

    expect(tags).toHaveLength(1)
    expect(tags[0]).toEqual({
      tag: 'important',
      source: 'ai:semantic',
    })
  })

  it('should return empty array when no tags exceed threshold', async () => {
    vi.mocked(mockEmbeddingService.generateBatchEmbeddings).mockResolvedValueOnce([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ])

    await service.initialize()

    // Mock message embedding with low similarity to all prototypes
    vi.mocked(mockEmbeddingService.generateEmbedding).mockResolvedValueOnce([0.5, 0.5, 0.5, 0.5])

    const tags = await service.analyze('今天天气不错')

    expect(tags).toHaveLength(0)
  })
})
