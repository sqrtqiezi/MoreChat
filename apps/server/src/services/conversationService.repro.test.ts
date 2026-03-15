import { describe, it, expect, vi } from 'vitest'
import { ConversationService } from './conversationService.js'

describe('repro: missing message in hot layer', () => {
  it('should not throw when DataLake returns undefined entry', async () => {
    const mockDb = {
      getMessageIndexes: vi.fn().mockResolvedValue([
        { dataLakeKey: 'hot/conv/2026-03-14.jsonl:missing_msg', createTime: 1773501707, isRecalled: false }
      ]),
      findContactsByUsernames: vi.fn().mockResolvedValue([]),
    } as any

    const mockDataLake = {
      getMessages: vi.fn().mockResolvedValue([undefined]),
    } as any

    const service = new ConversationService(mockDb, mockDataLake)

    await expect(service.getMessages('conv_1', { limit: 20 })).resolves.toEqual({
      messages: [],
      hasMore: false,
    })
  })
})
