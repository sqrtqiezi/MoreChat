// ABOUTME: 封装 openai SDK，统一对接兼容 OpenAI 接口的云端 LLM
// ABOUTME: 提供 chat 调用与 tryCreate 工厂，未配置时由调用方决定降级策略

import OpenAI from 'openai'

export interface LlmClientOptions {
  baseUrl: string
  apiKey: string
  model: string
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmChatOptions {
  temperature?: number
  maxTokens?: number
}

export class LlmClient {
  private readonly client: OpenAI
  private readonly model: string

  constructor(opts: LlmClientOptions) {
    this.client = new OpenAI({
      baseURL: opts.baseUrl,
      apiKey: opts.apiKey,
    })
    this.model = opts.model
  }

  static tryCreate(opts: Partial<LlmClientOptions>): LlmClient | undefined {
    if (!opts.baseUrl || !opts.apiKey || !opts.model) {
      return undefined
    }
    return new LlmClient({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, model: opts.model })
  }

  async chat(messages: LlmChatMessage[], opts: LlmChatOptions = {}): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 512,
    })

    const choice = response.choices?.[0]
    const content = choice?.message?.content
    if (!content) {
      throw new Error('LLM returned empty response')
    }

    return content
  }
}
