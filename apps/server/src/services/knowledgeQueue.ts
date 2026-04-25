// ABOUTME: Generic async queue for processing AI tasks with handler registration
// ABOUTME: Uses p-queue for concurrency control and provides idle/size utilities

import PQueue from 'p-queue'
import { logger } from '../lib/logger.js'

export interface KnowledgeTask {
  type: string
  msgId: string
  data: Record<string, any>
}

export type TaskHandler = (task: KnowledgeTask) => Promise<void>

export class KnowledgeQueue {
  private queue: PQueue
  private handlers: Map<string, TaskHandler> = new Map()

  constructor() {
    this.queue = new PQueue({ concurrency: 1 })
  }

  registerHandler(taskType: string, handler: TaskHandler): void {
    this.handlers.set(taskType, handler)
  }

  async enqueue(task: KnowledgeTask): Promise<void> {
    this.queue.add(async () => {
      const handler = this.handlers.get(task.type)
      if (!handler) {
        logger.warn(`No handler registered for task type: ${task.type}`)
        return
      }

      try {
        await handler(task)
      } catch (error) {
        logger.error(`Error processing task ${task.msgId}:`, error)
      }
    })
  }

  async waitForIdle(): Promise<void> {
    await this.queue.onIdle()
  }

  getQueueSize(): number {
    return this.queue.size
  }
}
