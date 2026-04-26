// ABOUTME: Tests for KnowledgeQueue async task processing service
// ABOUTME: Verifies handler registration, task enqueueing, processing, and queue utilities

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KnowledgeQueue } from './knowledgeQueue.js'
import type { KnowledgeTask, TaskHandler } from './knowledgeQueue.js'

describe('KnowledgeQueue', () => {
  let queue: KnowledgeQueue

  beforeEach(() => {
    queue = new KnowledgeQueue()
  })

  it('registers and executes task handlers', async () => {
    const handler = vi.fn<[KnowledgeTask], Promise<void>>(async () => {})
    queue.registerHandler('test-type', handler)

    const task: KnowledgeTask = {
      type: 'test-type',
      msgId: 'msg-1',
      data: { key: 'value' }
    }

    await queue.enqueue(task)
    await queue.waitForIdle()

    expect(handler).toHaveBeenCalledWith(task)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('processes tasks sequentially with concurrency 1', async () => {
    const executionOrder: number[] = []
    const handler = vi.fn<[KnowledgeTask], Promise<void>>(async (task) => {
      const taskNum = parseInt(task.msgId.split('-')[1])
      executionOrder.push(taskNum)
      await new Promise(resolve => setTimeout(resolve, 10))
    })

    queue.registerHandler('sequential', handler)

    const tasks: KnowledgeTask[] = [
      { type: 'sequential', msgId: 'msg-1', data: {} },
      { type: 'sequential', msgId: 'msg-2', data: {} },
      { type: 'sequential', msgId: 'msg-3', data: {} }
    ]

    for (const task of tasks) {
      queue.enqueue(task)
    }

    await queue.waitForIdle()

    expect(executionOrder).toEqual([1, 2, 3])
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('handles errors gracefully without stopping queue', async () => {
    const handler = vi.fn<[KnowledgeTask], Promise<void>>(async (task) => {
      if (task.msgId === 'msg-2') {
        throw new Error('Task failed')
      }
    })

    queue.registerHandler('error-test', handler)

    const tasks: KnowledgeTask[] = [
      { type: 'error-test', msgId: 'msg-1', data: {} },
      { type: 'error-test', msgId: 'msg-2', data: {} },
      { type: 'error-test', msgId: 'msg-3', data: {} }
    ]

    for (const task of tasks) {
      queue.enqueue(task)
    }

    await queue.waitForIdle()

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('provides queue size and idle status', async () => {
    const handler = vi.fn<[KnowledgeTask], Promise<void>>(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    queue.registerHandler('size-test', handler)

    expect(queue.getQueueSize()).toBe(0)

    const task1: KnowledgeTask = { type: 'size-test', msgId: 'msg-1', data: {} }
    const task2: KnowledgeTask = { type: 'size-test', msgId: 'msg-2', data: {} }

    queue.enqueue(task1)
    queue.enqueue(task2)

    expect(queue.getQueueSize()).toBeGreaterThan(0)

    await queue.waitForIdle()

    expect(queue.getQueueSize()).toBe(0)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('should process semantic-importance task with registered handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    queue.registerHandler('semantic-importance', handler)

    await queue.enqueue({
      type: 'semantic-importance',
      msgId: 'msg-semantic-1',
      data: { content: '请今天完成预算表' }
    })

    await queue.waitForIdle()

    expect(handler).toHaveBeenCalledWith({
      type: 'semantic-importance',
      msgId: 'msg-semantic-1',
      data: { content: '请今天完成预算表' }
    })
  })

  it('should process topic-clustering task with registered handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    queue.registerHandler('topic-clustering', handler)

    await queue.enqueue({
      type: 'topic-clustering',
      msgId: 'card_1',
      data: { knowledgeCardId: 'card_1' }
    })

    await queue.waitForIdle()

    expect(handler).toHaveBeenCalledWith({
      type: 'topic-clustering',
      msgId: 'card_1',
      data: { knowledgeCardId: 'card_1' }
    })
  })
})
