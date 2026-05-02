import {
  JuhexbotAdapter,
  type ChatroomMemberInfo,
  type ContactInfo,
  type GroupDetailInfo,
  type JuhexbotConfig,
  type ParsedWebhookPayload,
  type UserProfile,
} from './juhexbotAdapter.js'

const E2E_PROFILE_NICKNAME = 'MoreChat E2E Bot'
const E2E_PROFILE_AVATAR = 'https://example.invalid/assets/morechat-e2e-bot.png'

export class JuhexbotAdapterFake extends JuhexbotAdapter {
  private fakeConfig: JuhexbotConfig
  private sentMessageSequence = 0

  constructor(config: JuhexbotConfig) {
    super(config)
    this.fakeConfig = config
  }

  override parseWebhookPayload(payload: any): ParsedWebhookPayload {
    return super.parseWebhookPayload(payload)
  }

  override getConversationId(parsed: ParsedWebhookPayload): string {
    return super.getConversationId(parsed)
  }

  override getCurrentUsername(): string | undefined {
    return this.fakeConfig.clientUsername
  }

  override async sendRequest<T>(_path: string, _data: T): Promise<{ errcode: number; errmsg: string; data: any }> {
    throw new Error('JuhexbotAdapterFake does not support network requests')
  }

  override async getProfile(): Promise<UserProfile> {
    const profile = {
      username: this.fakeConfig.clientUsername ?? `e2e_bot_${this.fakeConfig.clientGuid}`,
      nickname: E2E_PROFILE_NICKNAME,
      avatar: E2E_PROFILE_AVATAR,
    }
    this.fakeConfig.clientUsername = profile.username
    return profile
  }

  override async getClientStatus(): Promise<{ online: boolean; guid: string }> {
    return {
      online: true,
      guid: this.fakeConfig.clientGuid,
    }
  }

  override async sendTextMessage(_toUsername: string, _content: string): Promise<{ msgId: string }> {
    this.sentMessageSequence += 1
    return {
      msgId: `e2e-msg-${String(this.sentMessageSequence).padStart(6, '0')}`,
    }
  }

  override async sendReferMessage(_params: {
    toUsername: string
    content: string
    referMsg: {
      msgType: number
      msgId: string
      fromUsername: string
      fromNickname: string
      source: string
      content: string
    }
  }): Promise<{ msgId: string }> {
    this.sentMessageSequence += 1
    return {
      msgId: `e2e-refer-${String(this.sentMessageSequence).padStart(6, '0')}`,
    }
  }

  override async setNotifyUrl(_notifyUrl: string): Promise<void> {
    return
  }

  override async getContact(usernameList: string[]): Promise<ContactInfo[]> {
    return usernameList.map((username) => ({
      username,
      nickname: username === this.fakeConfig.clientUsername ? E2E_PROFILE_NICKNAME : `E2E ${username}`,
      avatar: E2E_PROFILE_AVATAR,
    }))
  }

  override async getChatroomDetail(roomUsername: string): Promise<GroupDetailInfo> {
    return {
      roomUsername,
      name: `E2E ${roomUsername}`,
      avatar: E2E_PROFILE_AVATAR,
      memberCount: 2,
    }
  }

  override async getChatroomMemberDetail(roomUsername: string, version?: number): Promise<ChatroomMemberInfo> {
    const currentUsername = this.fakeConfig.clientUsername ?? `e2e_bot_${this.fakeConfig.clientGuid}`
    return {
      version: version ?? 0,
      members: [
        { username: currentUsername, nickname: E2E_PROFILE_NICKNAME },
        { username: `${roomUsername}_member`, nickname: `E2E ${roomUsername} Member` },
      ],
    }
  }
}
