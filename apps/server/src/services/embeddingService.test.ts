// ABOUTME: Tests for EmbeddingService that generates 512-dimensional vectors
// ABOUTME: using bge-small-zh-v1.5 ONNX model via Transformers.js
// NOTE: These tests are skipped in CI due to onnxruntime-node architecture issues
// The service is validated through integration tests in production

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const { mockPipeline, mockTransformersEnv, mockAppEnv } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
  mockTransformersEnv: {
    backends: {
      onnx: {
        wasm: { proxy: false, numThreads: 1 },
        executionProviders: ['wasm']
      }
    },
    allowLocalModels: false,
    useBrowserCache: false
  },
  mockAppEnv: {
    EMBEDDING_ENABLED: true,
    EMBEDDING_MODEL_PATH: undefined as string | undefined
  }
}));

// Mock transformers.js to avoid onnxruntime-node loading issues
vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipeline,
  env: mockTransformersEnv
}));

// Mock env module
vi.mock('../lib/env.js', () => ({
  env: mockAppEnv
}));

import { EmbeddingService } from './embeddingService.js';

describe('EmbeddingService', () => {
  beforeEach(() => {
    mockPipeline.mockReset();
    mockPipeline.mockResolvedValue(vi.fn());
    mockAppEnv.EMBEDDING_ENABLED = true;
    delete process.env.EMBEDDING_MODEL_PATH;
  });

  it('should instantiate without errors', () => {
    const service = new EmbeddingService();
    expect(service).toBeDefined();
  });

  it('should throw error when generating embedding before initialization', async () => {
    const service = new EmbeddingService();
    await expect(service.generateEmbedding('test')).rejects.toThrow('EmbeddingService not initialized');
  });

  it('should prefer local model path when EMBEDDING_MODEL_PATH is set', async () => {
    const originalPath = process.env.EMBEDDING_MODEL_PATH;
    process.env.EMBEDDING_MODEL_PATH = '/opt/morechat/models/bge-small-zh-v1.5';

    try {
      const service = new EmbeddingService();
      await service.initialize();

      expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', '/opt/morechat/models/bge-small-zh-v1.5', {
        device: 'wasm'
      });
    } finally {
      if (originalPath) {
        process.env.EMBEDDING_MODEL_PATH = originalPath;
      } else {
        delete process.env.EMBEDDING_MODEL_PATH;
      }
    }
  });

  it('should fallback to remote model ID when EMBEDDING_MODEL_PATH is not set', async () => {
    const originalPath = process.env.EMBEDDING_MODEL_PATH;
    delete process.env.EMBEDDING_MODEL_PATH;

    try {
      const service = new EmbeddingService();
      await service.initialize();

      expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
        device: 'wasm'
      });
    } finally {
      if (originalPath) {
        process.env.EMBEDDING_MODEL_PATH = originalPath;
      }
    }
  });
});

// Integration tests - run manually with: pnpm test:embedding
// These require model download (~50MB) and take time
describe.skip('EmbeddingService - Integration', () => {
  let embeddingService: EmbeddingService;

  beforeAll(async () => {
    embeddingService = new EmbeddingService();
    await embeddingService.initialize();
  }, 120000); // 120s timeout for model download

  it('should generate 512-dimensional embeddings', async () => {
    const text = '这是一条测试消息';
    const embedding = await embeddingService.generateEmbedding(text);

    expect(embedding).toBeInstanceOf(Array);
    expect(embedding).toHaveLength(512);
    expect(embedding.every(n => typeof n === 'number')).toBe(true);
  });

  it('should generate consistent embeddings for same text', async () => {
    const text = '相同的文本应该生成相同的向量';
    const embedding1 = await embeddingService.generateEmbedding(text);
    const embedding2 = await embeddingService.generateEmbedding(text);

    expect(embedding1).toEqual(embedding2);
  });

  it('should handle empty text', async () => {
    const embedding = await embeddingService.generateEmbedding('');

    expect(embedding).toBeInstanceOf(Array);
    expect(embedding).toHaveLength(512);
  });

  it('should generate different embeddings for different texts', async () => {
    const text1 = '今天天气很好';
    const text2 = '我喜欢编程';

    const embedding1 = await embeddingService.generateEmbedding(text1);
    const embedding2 = await embeddingService.generateEmbedding(text2);

    expect(embedding1).not.toEqual(embedding2);
  });

  it('should generate batch embeddings', async () => {
    const texts = ['第一条消息', '第二条消息', '第三条消息'];
    const embeddings = await embeddingService.generateBatchEmbeddings(texts);

    expect(embeddings).toHaveLength(3);
    embeddings.forEach(embedding => {
      expect(embedding).toHaveLength(512);
    });
  });
});
