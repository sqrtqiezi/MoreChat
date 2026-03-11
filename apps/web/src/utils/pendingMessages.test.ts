import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { addPendingMsgId, hasPendingMsgId, removePendingMsgId } from './pendingMessages'

describe('pendingMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should add and check pending msgId', () => {
    addPendingMsgId('msg_123')
    expect(hasPendingMsgId('msg_123')).toBe(true)
    expect(hasPendingMsgId('msg_456')).toBe(false)
  })

  it('should remove pending msgId manually', () => {
    addPendingMsgId('msg_123')
    expect(hasPendingMsgId('msg_123')).toBe(true)

    removePendingMsgId('msg_123')
    expect(hasPendingMsgId('msg_123')).toBe(false)
  })

  it('should auto-expire pending msgId after 30 seconds', () => {
    addPendingMsgId('msg_123')
    expect(hasPendingMsgId('msg_123')).toBe(true)

    vi.advanceTimersByTime(29000)
    expect(hasPendingMsgId('msg_123')).toBe(true)

    vi.advanceTimersByTime(1000)
    expect(hasPendingMsgId('msg_123')).toBe(false)
  })

  it('should handle multiple pending msgIds', () => {
    addPendingMsgId('msg_1')
    addPendingMsgId('msg_2')
    addPendingMsgId('msg_3')

    expect(hasPendingMsgId('msg_1')).toBe(true)
    expect(hasPendingMsgId('msg_2')).toBe(true)
    expect(hasPendingMsgId('msg_3')).toBe(true)

    removePendingMsgId('msg_2')
    expect(hasPendingMsgId('msg_1')).toBe(true)
    expect(hasPendingMsgId('msg_2')).toBe(false)
    expect(hasPendingMsgId('msg_3')).toBe(true)
  })
})
