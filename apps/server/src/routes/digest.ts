// ABOUTME: 摘要 API 路由，按时间范围生成对话摘要
// ABOUTME: 未配置 LLM 时返回 503，范围过小返回 400

import { Hono } from 'hono'
import { z } from 'zod'
import { DigestRangeTooSmallError } from '../services/digestService.js'
import type { DigestWorkflowService } from '../services/digestWorkflowService.js'
import { logger } from '../lib/logger.js'

interface DigestRouteDeps {
  digestWorkflowService?: DigestWorkflowService
}

const digestBodySchema = z
  .object({
    conversationId: z.string().min(1),
    startTime: z.number().int().nonnegative(),
    endTime: z.number().int().positive(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: 'startTime must be less than endTime',
    path: ['endTime'],
  })

export function digestRoutes(deps: DigestRouteDeps) {
  const router = new Hono()

  router.post('/', async (c) => {
    if (!deps.digestWorkflowService) {
      return c.json(
        {
          success: false,
          error: {
            code: 'LLM_NOT_CONFIGURED',
            message: 'Cloud LLM is not configured. Set LLM_BASE_URL/LLM_API_KEY/LLM_MODEL.',
          },
        },
        503
      )
    }

    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return c.json({ success: false, error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400)
    }

    const parsed = digestBodySchema.safeParse(raw)
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_BODY', message: 'Invalid request body', details: parsed.error.errors },
        },
        400
      )
    }

    try {
      const result = await deps.digestWorkflowService.generateManualDigest(parsed.data)
      return c.json({ success: true, data: result.digest })
    } catch (error) {
      if (error instanceof DigestRangeTooSmallError) {
        return c.json(
          {
            success: false,
            error: {
              code: 'DIGEST_RANGE_TOO_SMALL',
              message: `Digest requires more messages (got ${error.messageCount})`,
            },
          },
          400
        )
      }
      logger.error({ err: error }, 'Digest generation failed')
      return c.json(
        {
          success: false,
          error: { code: 'DIGEST_FAILED', message: 'Failed to generate digest' },
        },
        500
      )
    }
  })

  return router
}
