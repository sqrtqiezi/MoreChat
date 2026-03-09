export interface JuhexbotConfig {
  apiUrl: string
  appKey: string
  appSecret: string
  clientGuid: string
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
    if (parsed.message.fromUsername === this.config.clientGuid) {
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
    return {
      errcode: result.errcode ?? result.err_code ?? -1,
      errmsg: result.err_msg ?? result.msg ?? '',
      data: result.data
    }
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
}
