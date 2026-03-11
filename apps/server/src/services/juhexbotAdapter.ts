import { logger } from '../lib/logger.js'

export interface JuhexbotConfig {
  apiUrl: string
  appKey: string
  appSecret: string
  clientGuid: string
  clientUsername?: string  // 新增：登录用户的微信用户名
}

export interface UserProfile {
  username: string
  nickname: string
  avatar?: string
}

export interface ContactInfo {
  username: string
  nickname: string
  remark?: string
  avatar?: string
}

export interface GroupDetailInfo {
  roomUsername: string
  name: string
  avatar?: string
  memberCount: number
}

export interface ChatroomMemberInfo {
  version: number
  members: Array<{ username: string; nickname: string }>
}

export interface ParsedWebhookPayload {
  guid: string
  notifyType: number
  message: ParsedMessage
}

export interface ParsedMessage {
  msgId: string
  msgType: number
  fromUsername: string
  toUsername: string
  chatroomSender: string
  chatroom: string
  content: string
  desc: string
  createTime: number
  isChatroomMsg: boolean
  source: string
}

export interface GatewayRequest<T = any> {
  app_key: string
  app_secret: string
  path: string
  data: T
}

export class JuhexbotAdapter {
  private config: JuhexbotConfig

  constructor(config: JuhexbotConfig) {
    this.config = config
  }

  parseWebhookPayload(payload: any): ParsedWebhookPayload {
    const data = payload.data

    return {
      guid: payload.guid,
      notifyType: payload.notify_type,
      message: {
        msgId: data.msg_id,
        msgType: data.msg_type,
        fromUsername: data.from_username,
        toUsername: data.to_username,
        chatroomSender: data.chatroom_sender || '',
        chatroom: data.chatroom || '',
        content: data.content,
        desc: data.desc || '',
        createTime: data.create_time,
        isChatroomMsg: data.is_chatroom_msg === 1,
        source: data.source || ''
      }
    }
  }

  getConversationId(parsed: ParsedWebhookPayload): string {
    if (parsed.message.isChatroomMsg) {
      return parsed.message.chatroom
    }
    // 私聊：取对方的 username
    // 优先用 clientUsername，fallback 到 clientGuid（向后兼容）
    const selfIdentifier = this.config.clientUsername || this.config.clientGuid
    if (parsed.message.fromUsername === selfIdentifier) {
      return parsed.message.toUsername
    }
    return parsed.message.fromUsername
  }

  buildGatewayRequest<T>(path: string, data: T): GatewayRequest<T> {
    return {
      app_key: this.config.appKey,
      app_secret: this.config.appSecret,
      path,
      data
    }
  }

  async sendRequest<T>(path: string, data: T): Promise<{ errcode: number; errmsg: string; data: any }> {
    const fullPath = path.startsWith('/') ? path : `/${path}`
    const request = this.buildGatewayRequest(fullPath, data)
    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    const result = await response.json() as any
    // juhexbot API 返回字段不统一，统一为 errcode/errmsg
    // 有些接口用 errcode/err_code，有些用 baseResponse.ret
    const errcode = result.errcode ?? result.err_code ?? result.baseResponse?.ret ?? -1
    const errmsg = result.err_msg ?? result.msg ?? result.baseResponse?.errMsg ?? ''
    const respData = result.data ?? result
    const normalized = { errcode, errmsg, data: respData }
    if (normalized.errcode !== 0) {
      logger.warn({ path: fullPath, result, errcode: normalized.errcode, errmsg: normalized.errmsg }, 'juhexbot API error')
    }
    return normalized
  }

  async getClientStatus(): Promise<{ online: boolean; guid: string }> {
    const result = await this.sendRequest('/client/get_client_status', {
      guid: this.config.clientGuid
    })

    if (result.errcode !== 0) {
      throw new Error(result.errmsg || 'Failed to get client status')
    }

    return {
      online: result.data.status === 1,
      guid: this.config.clientGuid
    }
  }

  async sendTextMessage(toUsername: string, content: string): Promise<{ msgId: string }> {
    const result = await this.sendRequest('/message/send_text', {
      guid: this.config.clientGuid,
      to_username: toUsername,
      content
    })

    if (result.errcode !== 0) {
      throw new Error(result.errmsg || 'Failed to send message')
    }

    return { msgId: result.data.msg_id }
  }

  async setNotifyUrl(notifyUrl: string): Promise<void> {
    const result = await this.sendRequest('/client/set_notify_url', {
      guid: this.config.clientGuid,
      notify_url: notifyUrl
    })

    if (result.errcode !== 0) {
      throw new Error(result.errmsg || 'Failed to set notify URL')
    }
  }

  async getContact(usernameList: string[]): Promise<ContactInfo[]> {
    const result = await this.sendRequest('/contact/get_contact', {
      guid: this.config.clientGuid,
      username_list: usernameList
    })

    if (result.errcode !== 0) {
      throw new Error(result.errmsg || 'Failed to get contact')
    }

    // API 返回格式：contactList 数组，字段为嵌套对象 { string: "value" }
    const contacts = result.data.contactList || result.data.data || []
    return contacts.map((c: any) => ({
      username: c.userName?.string || c.username || '',
      nickname: c.nickName?.string || c.nickname || '',
      remark: c.remark?.string || undefined,
      avatar: c.bigHeadImgUrl || c.smallHeadImgUrl || c.avatar || undefined,
    }))
  }

  async getChatroomDetail(roomUsername: string): Promise<GroupDetailInfo> {
    // 用 getContact 获取群基本信息（名称、头像、成员数）
    const contactResult = await this.sendRequest('/contact/get_contact', {
      guid: this.config.clientGuid,
      username_list: [roomUsername]
    })

    if (contactResult.errcode !== 0) {
      throw new Error(contactResult.errmsg || 'Failed to get chatroom detail')
    }

    const contacts = contactResult.data.contactList || []
    const room = contacts[0]
    if (!room) {
      throw new Error('Chatroom not found in contact list')
    }

    return {
      roomUsername: room.userName?.string || roomUsername,
      name: room.nickName?.string || roomUsername,
      avatar: room.bigHeadImgUrl || room.smallHeadImgUrl || undefined,
      memberCount: room.newChatroomData?.memberCount || 0,
    }
  }

  async getChatroomMemberDetail(roomUsername: string, version?: number): Promise<ChatroomMemberInfo> {
    const result = await this.sendRequest('/room/get_chatroom_member_detail', {
      guid: this.config.clientGuid,
      room_username: roomUsername,
      version: version || 0
    })

    if (result.errcode !== 0) {
      throw new Error(result.errmsg || 'Failed to get chatroom members')
    }

    logger.info({ roomUsername, dataKeys: Object.keys(result.data || {}), rawSample: JSON.stringify(result.data).slice(0, 500) }, 'getChatroomMemberDetail raw response')

    return {
      version: result.data.version || 0,
      members: (result.data.members || []).map((m: any) => ({
        username: m.username,
        nickname: m.nickname || m.display_name || '',
      }))
    }
  }

  async getProfile(): Promise<UserProfile> {
    const result = await this.sendRequest('/user/get_profile', {
      guid: this.config.clientGuid
    })

    if (result.errcode !== 0) {
      throw new Error(result.errmsg || 'Failed to get profile')
    }

    const userInfo = result.data.userInfo || result.data
    return {
      username: userInfo.userName?.string || userInfo.username || '',
      nickname: userInfo.nickName?.string || userInfo.nickname || '',
      avatar: userInfo.smallHeadImgUrl || userInfo.bigHeadImgUrl || userInfo.avatar || undefined,
    }
  }
}
