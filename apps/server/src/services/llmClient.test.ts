// ABOUTME: LlmClient 单元测试，验证对 openai SDK 的封装
// ABOUTME: 通过 mock OpenAI 客户端覆盖正常调用、错误传递与配置工厂逻辑

import { describe, it, expect, beforeEach, vi } from 'vitest'

const createMock = vi.fn()

vi.mock('openai', () => {
  function MockOpenAI(opts: any) {
    ;(globalThis as any).__openaiOpts = opts
    return {
      chat: {
        completions: {
          create: createMock,
        },
      },
    }
  }
  return { default: MockOpenAI }
})

import { LlmClient } from './llmClient.js'

describe('LlmClient', () => {
  beforeEach(() => {
    createMock.mockReset()
    ;(globalThis as any).__openaiOpts = undefined
  })

  it('should pass baseUrl and apiKey to underlying SDK', () => {
    new LlmClient({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' })

    expect((globalThis as any).__openaiOpts).toEqual({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'sk-test',
    })
  })

  it('should send chat completion request and return text', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '这是摘要内容' } }],
    })

    const client = new LlmClient({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' })

    const text = await client.chat([
      { role: 'system', content: '你是摘要助手' },
      { role: 'user', content: '消息列表...' },
    ], { temperature: 0.2, maxTokens: 256 })

    expect(text).toBe('这是摘要内容')
    expect(createMock).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '你是摘要助手' },
        { role: 'user', content: '消息列表...' },
      ],
      temperature: 0.2,
      max_tokens: 256,
    })
  })

  it('should throw when response has no choices', async () => {
    createMock.mockResolvedValueOnce({ choices: [] })
    const client = new LlmClient({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' })
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/empty response/i)
  })

  it('tryCreate returns undefined when config is missing', () => {
    expect(LlmClient.tryCreate({ baseUrl: '', apiKey: '', model: '' })).toBeUndefined()
    expect(LlmClient.tryCreate({ baseUrl: 'x', apiKey: '', model: 'm' })).toBeUndefined()
    expect(LlmClient.tryCreate({ baseUrl: 'x', apiKey: 'y', model: '' })).toBeUndefined()
  })

  it('tryCreate returns LlmClient when fully configured', () => {
    const client = LlmClient.tryCreate({ baseUrl: 'x', apiKey: 'y', model: 'm' })
    expect(client).toBeInstanceOf(LlmClient)
  })
})
