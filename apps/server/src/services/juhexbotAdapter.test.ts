import { describe, it, expect, vi, afterEach } from 'vitest'
import { JuhexbotAdapter } from './juhexbotAdapter.js'
import { textMessage, imageMessage, messageRecall, voiceCallMessage, appMessage } from '../../../../tests/fixtures/messages.js'

describe('JuhexbotAdapter', () => {
  const adapter = new JuhexbotAdapter({
    apiUrl: 'http://chat-api.juhebot.com/open/GuidRequest',
    appKey: 'test_key',
    appSecret: 'test_secret',
    clientGuid: 'test-guid-123',
    clientUsername: 'test_user',  // 新增：匹配 fixture 中的 from_username
    cloudApiUrl: 'http://cloud.test.com'
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

    it('should prefer msg_id over newMsgId when both present', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 0, errMsg: {} },
          msgId: 881222943,
          newMsgId: '4877500997370050015',
        })
      })

      const result = await adapter.sendTextMessage('wxid_target', 'test')
      expect(result).toEqual({ msgId: '881222943' })
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

  describe('getCdnInfo', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return CDN info', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            cdn_info: 'cdn-info-string',
            client_version: 123456,
            device_type: 'android',
            username: 'test_wx_user'
          }
        })
      })

      const result = await adapter.getCdnInfo()
      expect(result).toEqual({
        cdn_info: 'cdn-info-string',
        client_version: 123456,
        device_type: 'android',
        username: 'test_wx_user'
      })
    })

    it('should throw error when API fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 1001,
          err_msg: 'CDN info unavailable'
        })
      })

      await expect(adapter.getCdnInfo()).rejects.toThrow('CDN info unavailable')
    })
  })

  describe('downloadImage', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should return download URL on success', async () => {
      const fetchMock = vi.fn()
      // 第一次调用：getCdnInfo（通过 sendRequest -> gateway）
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            cdn_info: 'cdn-info-string',
            client_version: 123456,
            device_type: 'android',
            username: 'test_wx_user'
          }
        })
      })
      // 第二次调用：cloud download API
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: { url: 'https://cdn.example.com/image.jpg' }
        })
      })
      globalThis.fetch = fetchMock

      const result = await adapter.downloadImage('aes-key-123', 'file-id-456', 'photo.jpg')
      expect(result).toBe('https://cdn.example.com/image.jpg')

      // 验证第二次调用是对 cloud API 的请求
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[1][0]).toBe('http://cloud.test.com/cloud/download')
      const body = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(body.aes_key).toBe('aes-key-123')
      expect(body.file_id).toBe('file-id-456')
      expect(body.file_name).toBe('photo.jpg')
      expect(body.file_type).toBe(2)
      expect(body.base_request.cdn_info).toBe('cdn-info-string')
    })

    it('should support download_url field in response', async () => {
      const fetchMock = vi.fn()
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            cdn_info: 'cdn-info',
            client_version: 1,
            device_type: 'ios',
            username: 'user'
          }
        })
      })
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: { download_url: 'https://cdn.example.com/alt.jpg' }
        })
      })
      globalThis.fetch = fetchMock

      const result = await adapter.downloadImage('key', 'id', 'img.jpg')
      expect(result).toBe('https://cdn.example.com/alt.jpg')
    })

    it('should throw error when cloud API returns error', async () => {
      const fetchMock = vi.fn()
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            cdn_info: 'cdn-info',
            client_version: 1,
            device_type: 'ios',
            username: 'user'
          }
        })
      })
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 5001,
          errmsg: 'Download failed'
        })
      })
      globalThis.fetch = fetchMock

      await expect(adapter.downloadImage('key', 'id', 'img.jpg')).rejects.toThrow('Download failed')
    })

    it('should throw error when no download URL in response', async () => {
      const fetchMock = vi.fn()
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            cdn_info: 'cdn-info',
            client_version: 1,
            device_type: 'ios',
            username: 'user'
          }
        })
      })
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: {}
        })
      })
      globalThis.fetch = fetchMock

      await expect(adapter.downloadImage('key', 'id', 'img.jpg')).rejects.toThrow('No download URL in cloud API response')
    })

    it('should pass fileType parameter to cloud API', async () => {
      const fetchMock = vi.fn()
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            cdn_info: 'cdn-info-string',
            client_version: 123456,
            device_type: 'android',
            username: 'test_wx_user'
          }
        })
      })
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: { url: 'https://cdn.example.com/hd-image.jpg' }
        })
      })
      globalThis.fetch = fetchMock

      const result = await adapter.downloadImage('aes-key-123', 'file-id-456', 'photo.jpg', 1)
      expect(result).toBe('https://cdn.example.com/hd-image.jpg')

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const body = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(body.file_type).toBe(1)
    })

    it('should default to fileType=2 (mid) when not specified', async () => {
      const fetchMock = vi.fn()
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            cdn_info: 'cdn-info-string',
            client_version: 123456,
            device_type: 'android',
            username: 'test_wx_user'
          }
        })
      })
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({
          errcode: 0,
          data: { url: 'https://cdn.example.com/mid-image.jpg' }
        })
      })
      globalThis.fetch = fetchMock

      const result = await adapter.downloadImage('aes-key-123', 'file-id-456', 'photo.jpg')
      expect(result).toBe('https://cdn.example.com/mid-image.jpg')

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const body = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(body.file_type).toBe(2)
    })
  })

  describe('uploadImageToCdn', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should upload image to CDN successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: {
            file_id: 'cdn-file-123',
            aes_key: 'aes-key-456',
            file_size: 102400,
            file_md5: 'abc123def456'
          }
        })
      })

      const result = await adapter.uploadImageToCdn('https://example.com/image.jpg')
      expect(result).toEqual({
        fileId: 'cdn-file-123',
        aesKey: 'aes-key-456',
        fileSize: 102400,
        fileMd5: 'abc123def456'
      })

      expect(fetch).toHaveBeenCalledWith('http://chat-api.juhebot.com/open/GuidRequest', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/cloud/cdn_upload')
      }))
    })

    it('should throw error when upload fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 5001,
          err_msg: 'Upload failed'
        })
      })

      await expect(adapter.uploadImageToCdn('https://example.com/image.jpg')).rejects.toThrow('Upload failed')
    })
  })

  describe('sendImageMessage', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should send image message successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { msg_id: 'img_msg_789' }
        })
      })

      const result = await adapter.sendImageMessage({
        toUsername: 'wxid_target',
        fileId: 'cdn-file-123',
        aesKey: 'aes-key-456',
        fileSize: 102400,
        bigFileSize: 204800,
        thumbFileSize: 10240,
        fileMd5: 'abc123def456',
        thumbWidth: 800,
        thumbHeight: 600,
        fileCrc: 12345
      })

      expect(result).toEqual({ msgId: 'img_msg_789' })

      expect(fetch).toHaveBeenCalledWith('http://chat-api.juhebot.com/open/GuidRequest', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/msg/send_image')
      }))
    })

    it('should handle msgId field in response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { msgId: 'img_msg_999' }
        })
      })

      const result = await adapter.sendImageMessage({
        toUsername: 'wxid_target',
        fileId: 'file-id',
        aesKey: 'aes-key',
        fileSize: 100,
        bigFileSize: 200,
        thumbFileSize: 50,
        fileMd5: 'md5',
        thumbWidth: 100,
        thumbHeight: 100,
        fileCrc: 123
      })

      expect(result).toEqual({ msgId: 'img_msg_999' })
    })

    it('should throw error when send fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 2001,
          err_msg: 'Send image failed'
        })
      })

      await expect(adapter.sendImageMessage({
        toUsername: 'wxid_target',
        fileId: 'file-id',
        aesKey: 'aes-key',
        fileSize: 100,
        bigFileSize: 200,
        thumbFileSize: 50,
        fileMd5: 'md5',
        thumbWidth: 100,
        thumbHeight: 100,
        fileCrc: 123
      })).rejects.toThrow('Send image failed')
    })

    it('should throw error when response missing msgId', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: {}
        })
      })

      await expect(adapter.sendImageMessage({
        toUsername: 'wxid_target',
        fileId: 'file-id',
        aesKey: 'aes-key',
        fileSize: 100,
        bigFileSize: 200,
        thumbFileSize: 50,
        fileMd5: 'md5',
        thumbWidth: 100,
        thumbHeight: 100,
        fileCrc: 123
      })).rejects.toThrow('Image sent but response missing msgId')
    })

    it('should return newMsgId when present in baseResponse format', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          baseResponse: { ret: 0, errMsg: {} },
          msgId: 881222943,
          newMsgId: '4877500997370050015',
        })
      })

      const result = await adapter.sendImageMessage({
        toUsername: 'wxid_target',
        fileId: 'file-id',
        aesKey: 'aes-key',
        fileSize: 100,
        bigFileSize: 200,
        thumbFileSize: 50,
        fileMd5: 'md5',
        thumbWidth: 100,
        thumbHeight: 100,
        fileCrc: 123
      })

      expect(result.msgId).toBe('881222943')
      expect(result.newMsgId).toBe('4877500997370050015')
    })
  })

  describe('sendReferMessage', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should call /msg/send_refer_msg with correct params', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: { msg_id: 'refer_123' }
        })
      })

      const result = await adapter.sendReferMessage({
        toUsername: 'wxid_target',
        content: '回复内容',
        referMsg: {
          msgType: 1,
          msgId: 'original_123',
          fromUsername: 'wxid_sender',
          fromNickname: '发送者',
          source: '',
          content: '原始消息内容',
        },
      })

      expect(result.msgId).toBe('refer_123')
      expect(fetch).toHaveBeenCalledWith('http://chat-api.juhebot.com/open/GuidRequest', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/msg/send_refer_msg'),
      }))

      // 验证请求体中的 refer_msg 字段
      const callBody = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(callBody.data.refer_msg).toEqual({
        msg_type: 1,
        msg_id: 'original_123',
        from_username: 'wxid_sender',
        from_nickname: '发送者',
        source: '',
        content: '原始消息内容',
      })
    })

    it('should throw error when send fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 2001,
          err_msg: 'Client offline'
        })
      })

      await expect(adapter.sendReferMessage({
        toUsername: 'wxid_target',
        content: '回复内容',
        referMsg: {
          msgType: 1,
          msgId: 'original_123',
          fromUsername: 'wxid_sender',
          fromNickname: '发送者',
          source: '',
          content: '原始消息内容',
        },
      })).rejects.toThrow('Client offline')
    })

    it('should throw error when response missing msgId', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          errcode: 0,
          data: {}
        })
      })

      await expect(adapter.sendReferMessage({
        toUsername: 'wxid_target',
        content: '回复内容',
        referMsg: {
          msgType: 1,
          msgId: 'original_123',
          fromUsername: 'wxid_sender',
          fromNickname: '发送者',
          source: '',
          content: '原始消息内容',
        },
      })).rejects.toThrow('Refer message sent but response missing msgId')
    })
  })
})
