import { describe, it, expect, vi, afterEach } from 'vitest'
import { JuhexbotAdapter } from './juhexbotAdapter.js'
import { textMessage, imageMessage, messageRecall, voiceCallMessage, appMessage } from '../../../../tests/fixtures/messages.js'

describe('JuhexbotAdapter', () => {
  const adapter = new JuhexbotAdapter({
    apiUrl: 'http://chat-api.juhebot.com/open/GuidRequest',
    appKey: 'test_key',
    appSecret: 'test_secret',
    clientGuid: 'test-guid-123',
    clientUsername: 'test_user'  // 新增：匹配 fixture 中的 from_username
  })

  describe('parseWebhookPayload', () => {
    it('should parse text message', () => {
      const result = adapter.parseWebhookPayload(textMessage)

      expect(result.guid).toBe('test-guid-123')
      expect(result.notifyType).toBe(1010)
      expect(result.message.msgType).toBe(1)
      expect(result.message.content).toBe('Hello, this is a test message')
      expect(result.message.fromUsername).toBe('test_user')
      expect(result.message.toUsername).toBe('filehelper')
      expect(result.message.isChatroomMsg).toBe(false)
    })

    it('should parse image message', () => {
      const result = adapter.parseWebhookPayload(imageMessage)

      expect(result.message.msgType).toBe(3)
      expect(result.message.isChatroomMsg).toBe(false)
    })

    it('should parse message recall', () => {
      const result = adapter.parseWebhookPayload(messageRecall)

      expect(result.message.msgType).toBe(10002)
      expect(result.message.content).toContain('revokemsg')
    })

    it('should parse voice/video call message', () => {
      const result = adapter.parseWebhookPayload(voiceCallMessage)

      expect(result.message.msgType).toBe(51)
    })

    it('should parse chatroom message', () => {
      const result = adapter.parseWebhookPayload(appMessage)

      expect(result.message.msgType).toBe(49)
      expect(result.message.isChatroomMsg).toBe(true)
      expect(result.message.chatroomSender).toBe('test_sender')
      expect(result.message.chatroom).toBe('test_chatroom@chatroom')
    })
  })

  describe('getConversationId', () => {
    it('should return contact username for private message', () => {
      const parsed = adapter.parseWebhookPayload(textMessage)
      const convId = adapter.getConversationId(parsed)

      expect(convId).toBe('filehelper')  // 修正：应该返回对方的 username
    })

    it('should return chatroom id for group message', () => {
      const parsed = adapter.parseWebhookPayload(appMessage)
      const convId = adapter.getConversationId(parsed)

      expect(convId).toBe('test_chatroom@chatroom')
    })
  })

  describe('buildGatewayRequest', () => {
    it('should build correct gateway request', () => {
      const request = adapter.buildGatewayRequest('/msg/send_text', {
        guid: 'test-guid-123',
        conversation_id: '5:1xxxx',
        content: 'hello'
      })

      expect(request.app_key).toBe('test_key')
      expect(request.app_secret).toBe('test_secret')
      expect(request.path).toBe('/msg/send_text')
      expect(request.data.content).toBe('hello')
    })
  })

  describe('getClientStatus', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return online status when client is active', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { status: 1, guid: 'test-guid-123' }
        })
      })

      const result = await adapter.getClientStatus()
      expect(result).toEqual({ online: true, guid: 'test-guid-123' })
    })

    it('should return offline status when client is inactive', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { status: 0, guid: 'test-guid-123' }
        })
      })

      const result = await adapter.getClientStatus()
      expect(result).toEqual({ online: false, guid: 'test-guid-123' })
    })

    it('should throw error when API returns error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 1001,
          err_msg: 'Invalid credentials'
        })
      })

      await expect(adapter.getClientStatus()).rejects.toThrow('Invalid credentials')
    })
  })

  describe('sendTextMessage', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should send text message successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { msg_id: 'sent_msg_123' }
        })
      })

      const result = await adapter.sendTextMessage('wxid_target', '你好')
      expect(result).toEqual({ msgId: 'sent_msg_123' })

      expect(fetch).toHaveBeenCalledWith('http://chat-api.juhebot.com/open/GuidRequest', expect.objectContaining({
        method: 'POST'
      }))
    })

    it('should throw error when send fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 2001,
          err_msg: 'Client offline'
        })
      })

      await expect(adapter.sendTextMessage('wxid_target', '你好')).rejects.toThrow('Client offline')
    })

    it('should parse msg id from list[0].newMsgId response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 0, errMsg: {} },
          count: 1,
          list: [
            {
              ret: 0,
              newMsgId: '9116989704999965051'
            }
          ]
        })
      })

      const result = await adapter.sendTextMessage('wxid_target', 'test')
      expect(result).toEqual({ msgId: '9116989704999965051' })
    })
  })

  describe('setNotifyUrl', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should set notify URL successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: {}
        })
      })

      await adapter.setNotifyUrl('https://example.com/webhook')

      expect(fetch).toHaveBeenCalledWith('http://chat-api.juhebot.com/open/GuidRequest', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('/client/set_notify_url')
      }))
    })

    it('should throw error when setting notify URL fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 3001,
          err_msg: 'Invalid URL format'
        })
      })

      await expect(adapter.setNotifyUrl('invalid-url')).rejects.toThrow('Invalid URL format')
    })
  })

  describe('getContact', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return contact info for username list', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 0 },
          contactList: [
            {
              userName: { string: 'wxid_test1' },
              nickName: { string: '张三' },
              remark: { string: '张三备注' },
              bigHeadImgUrl: 'https://wx.qlogo.cn/test1.jpg',
            }
          ]
        })
      })

      const result = await adapter.getContact(['wxid_test1'])
      expect(result).toEqual([
        {
          username: 'wxid_test1',
          nickname: '张三',
          remark: '张三备注',
          avatar: 'https://wx.qlogo.cn/test1.jpg',
        }
      ])
    })

    it('should throw error when API fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 1001,
          err_msg: 'Request failed'
        })
      })

      await expect(adapter.getContact(['wxid_test1'])).rejects.toThrow('Request failed')
    })
  })

  describe('getChatroomDetail', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return chatroom detail', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 0 },
          contactList: [
            {
              userName: { string: 'room@chatroom' },
              nickName: { string: '开发群' },
              smallHeadImgUrl: 'https://wx.qlogo.cn/room.jpg',
              newChatroomData: { memberCount: 42 },
            }
          ]
        })
      })

      const result = await adapter.getChatroomDetail('room@chatroom')
      expect(result).toEqual({
        roomUsername: 'room@chatroom',
        name: '开发群',
        avatar: 'https://wx.qlogo.cn/room.jpg',
        memberCount: 42,
      })
    })

    it('should throw error when API fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 1001,
          err_msg: 'Room not found'
        })
      })

      await expect(adapter.getChatroomDetail('room@chatroom')).rejects.toThrow('Room not found')
    })
  })

  describe('getChatroomMemberDetail', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return chatroom member list', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            serverVersion: 5,
            newChatroomData: {
              chatRoomMember: [
                { userName: 'wxid_a', nickName: '成员A', displayName: '' },
                { userName: 'wxid_b', nickName: '成员B', displayName: '群昵称B' },
              ]
            }
          }
        })
      })

      const result = await adapter.getChatroomMemberDetail('room@chatroom', 0)
      expect(result).toEqual({
        version: 5,
        members: [
          { username: 'wxid_a', nickname: '成员A' },
          { username: 'wxid_b', nickname: '群昵称B' },
        ]
      })
    })

    it('should throw error when API fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 1001,
          err_msg: 'Failed to get members'
        })
      })

      await expect(adapter.getChatroomMemberDetail('room@chatroom')).rejects.toThrow('Failed to get members')
    })
  })

  describe('getProfile', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return user profile with username and nickname', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 0 },
          userInfo: {
            userName: { string: 'njin_cool' },
            nickName: { string: '牛晋' },
            smallHeadImgUrl: 'https://wx.qlogo.cn/test.jpg',
          }
        })
      })

      const result = await adapter.getProfile()
      expect(result).toEqual({
        username: 'njin_cool',
        nickname: '牛晋',
        avatar: 'https://wx.qlogo.cn/test.jpg',
      })
    })

    it('should throw error when API fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 1001 },
          errMsg: 'Failed to get profile'
        })
      })

      await expect(adapter.getProfile()).rejects.toThrow('Failed to get profile')
    })
  })
})
