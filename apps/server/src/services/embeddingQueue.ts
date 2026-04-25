// ABOUTME: Async queue for processing vector embedding generation tasks
// ABOUTME: Uses p-queue to serialize embedding generation and DuckDB insertion

import PQueue from 'p-queue'
import { logger } from '../lib/logger.js'
import type { EmbeddingService } from './embeddingService.js'
import type { DuckDBService } from './duckdbService.js'

export interface EmbeddingTask {
  msgId: string
  content: string
  createTime: number
}

export class EmbeddingQueue {
  private queue: PQueue
  private embeddingService: EmbeddingService
  private duckdbService: DuckDBService

  constructor(embeddingService: EmbeddingService, duckdbService: DuckDBService) {
    this.embeddingService = embeddingService
    this.duckdbService = duckdbService
    this.queue = new PQueue({ concurrency: 1 })
  }

  enqueue(task: EmbeddingTask): void {
    if (!task.content || task.content.trim() === '') {
      return
    }

    this.queue.add(async () => {
      try {
        const embedding = await this.embeddingService.generateEmbedding(task.content)
        await this.duckdbService.insertVector({
          msgId: task.msgId,
          embedding,
          createTime: task.createTime,
        })
        logger.debug(`向量生成成功: ${task.msgId}`)
      } catch (error) {
        logger.error({ err: error, msgId: task.msgId }, '向量生成失败')
      }
    }).catch((error) => {
      logger.error({ err: error, msgId: task.msgId }, '队列任务执行失败')
    })
  }

  async waitForIdle(): Promise<void> {
    await this.queue.onIdle()
  }

  getQueueSize(): number {
    return this.queue.size + this.queue.pending
  }
}
