import {
  CDN_FILE_TYPE,
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
const E2E_IMAGE_DATA_URL = 'data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs='
const E2E_FILE_DATA_URL = 'data:application/octet-stream;base64,ZTJlLWJvdW5kYXJ5LWZpbGU='
const E2E_EMOJI_BUFFER = Buffer.from(
  'R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=',
  'base64'
)

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

  private nextId(prefix: string): string {
    this.sentMessageSequence += 1
    return `${prefix}-${String(this.sentMessageSequence).padStart(6, '0')}`
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
    return {
      msgId: this.nextId('e2e-msg'),
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
    return {
      msgId: this.nextId('e2e-refer'),
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

  override async getCdnInfo(): Promise<{
    cdn_info: string
    client_version: number
    device_type: string
    username: string
  }> {
    return {
      cdn_info: 'e2e-offline-cdn',
      client_version: 0,
      device_type: 'e2e-offline',
      username: this.fakeConfig.clientUsername ?? `e2e_bot_${this.fakeConfig.clientGuid}`,
    }
  }

  override async uploadImageToCdn(imageUrl: string): Promise<{
    fileId: string
    aesKey: string
    fileSize: number
    fileMd5: string
  }> {
    const token = Buffer.from(imageUrl).toString('base64url').slice(0, 16) || 'offline'
    return {
      fileId: `e2e-file-${token}`,
      aesKey: 'e2e-aes-key',
      fileSize: imageUrl.length,
      fileMd5: 'e2e-md5',
    }
  }

  override async sendImageMessage(_params: {
    toUsername: string
    fileId: string
    aesKey: string
    fileSize: number
    bigFileSize: number
    thumbFileSize: number
    fileMd5: string
    thumbWidth: number
    thumbHeight: number
    fileCrc: number
  }): Promise<{ msgId: string; newMsgId?: string }> {
    const msgId = this.nextId('e2e-image')
    return {
      msgId,
      newMsgId: msgId,
    }
  }

  override async downloadImage(
    _aesKey: string,
    _fileId: string,
    _fileName: string,
    fileType: number = CDN_FILE_TYPE.IMAGE_MID
  ): Promise<string> {
    return fileType === CDN_FILE_TYPE.ATTACHMENT ? E2E_FILE_DATA_URL : E2E_IMAGE_DATA_URL
  }

  override async downloadEmoji(_params: {
    cdnUrl: string
    aesKey?: string
    encryptUrl?: string
  }): Promise<Buffer> {
    return E2E_EMOJI_BUFFER
  }
}
