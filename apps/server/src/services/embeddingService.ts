// ABOUTME: Service for generating 512-dimensional vector embeddings from text
// ABOUTME: using bge-small-zh-v1.5 ONNX model via Transformers.js

import { pipeline, type FeatureExtractionPipeline, env } from '@huggingface/transformers';
import { logger } from '../lib/logger.js';

export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private readonly modelId = 'Xenova/bge-small-zh-v1.5';

  async initialize(): Promise<void> {
    if (this.extractor) {
      return;
    }

    try {
      const wasmBackend = env.backends.onnx?.wasm

      // Force WASM backend (disable onnxruntime-node)
      if (wasmBackend) {
        wasmBackend.proxy = false;
        wasmBackend.numThreads = 1;
      }
      env.allowLocalModels = false;
      env.useBrowserCache = false;

      // Disable onnxruntime-node backend
      if (env.backends.onnx) {
        (env.backends.onnx as any).executionProviders = ['wasm'];
      }

      logger.info(`Loading embedding model: ${this.modelId}`);
      this.extractor = await pipeline('feature-extraction', this.modelId, {
        device: 'wasm'
      });
      logger.info('Embedding model loaded successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to load embedding model');
      this.extractor = null;
    }
  }

  isAvailable(): boolean {
    return this.extractor !== null;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new Error('EmbeddingService not initialized');
    }

    try {
      const output = await this.extractor(text, {
        pooling: 'mean',
        normalize: true,
      });

      const embedding = Array.from(output.data as Float32Array);
      return embedding;
    } catch (error) {
      logger.error({ err: error, text }, 'Failed to generate embedding');
      throw error;
    }
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.generateEmbedding(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }
}
