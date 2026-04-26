// ABOUTME: 摘要路由单元测试，覆盖正常生成、配置缺失和范围过小三种情况
// ABOUTME: 通过 mock DigestWorkflowService 验证响应码与错误码

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { digestRoutes } from './digest.js'
import { DigestRangeTooSmallError } from '../services/digestService.js'

describe('digest routes', () => {
  let app: Hono
  let mockDigestWorkflowService: any

  beforeEach(() => {
    mockDigestWorkflowService = {
      generateManualDigest: vi.fn(),
    }
    app = new Hono()
    app.route('/api/digest', digestRoutes({ digestWorkflowService: mockDigestWorkflowService }))
  })

  it('returns 503 when digest workflow is not configured', async () => {
    app = new Hono()
    app.route('/api/digest', digestRoutes({ digestWorkflowService: undefined }))

    const res = await app.request('/api/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv_1', startTime: 100, endTime: 200 }),
    })
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('LLM_NOT_CONFIGURED')
  })

  it('returns 400 when payload is invalid', async () => {
    const res = await app.request('/api/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: '', startTime: 200, endTime: 100 }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when range is too small', async () => {
    mockDigestWorkflowService.generateManualDigest.mockRejectedValue(new DigestRangeTooSmallError(2))

    const res = await app.request('/api/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv_1', startTime: 100, endTime: 200 }),
    })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('DIGEST_RANGE_TOO_SMALL')
  })

  it('returns digest entry on success', async () => {
    const persisted = {
      id: 'digest_1',
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
      summary: '摘要内容',
      messageCount: 5,
      sourceKind: 'manual',
      triggerMsgId: null,
      status: 'ready',
      errorMessage: null,
      createdAt: new Date('2026-04-26T00:00:00Z'),
      updatedAt: new Date('2026-04-26T00:00:00Z'),
    }
    mockDigestWorkflowService.generateManualDigest.mockResolvedValue({
      digest: persisted,
      knowledgeCard: null,
    })

    const res = await app.request('/api/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv_1', startTime: 100, endTime: 200 }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('digest_1')
    expect(mockDigestWorkflowService.generateManualDigest).toHaveBeenCalledWith({
      conversationId: 'conv_1',
      startTime: 100,
      endTime: 200,
    })
  })

  it('returns 500 on unexpected error', async () => {
    mockDigestWorkflowService.generateManualDigest.mockRejectedValue(new Error('boom'))

    const res = await app.request('/api/digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: 'conv_1', startTime: 100, endTime: 200 }),
    })
    expect(res.status).toBe(500)
  })
})
