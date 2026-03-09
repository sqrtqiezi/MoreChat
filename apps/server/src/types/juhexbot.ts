/**
 * juhexbot API 类型定义
 * 基于统一网关模式
 */

// 统一网关请求格式
export interface GatewayRequest<T = any> {
  app_key: string
  app_secret: string
  path: string
  data: T
}

// 统一网关响应格式
export interface GatewayResponse<T = any> {
  code: number
  message: string
  data?: T
}

// ========== 客户端相关 ==========

export interface RestoreClientData {
  guid: string
  proxy?: string
  is_login_proxy?: boolean
  bridge?: string
  sync_history_msg?: boolean
  auto_start?: boolean
}

export interface CreateClientData {
  client_type?: number
  proxy?: string
  is_long_proxy?: boolean
  bridge?: string
  payload?: string
  auto_start?: boolean
}

export interface SetNotifyUrlData {
  guid: string
  notify_url: string
}

export interface GetClientStatusData {
  guid: string
}

// ========== 消息相关 ==========

export interface SendTextMessageData {
  guid: string
  conversation_id: string
  content: string
}

export interface SendImageMessageData {
  guid: string
  to_username: string
  file_id: string
  aes_key: string
  file_size: number
  big_file_size: number
  thumb_file_size: number
  file_md5: string
  thumb_width: number
  thumb_height: number
  file_crc: number
}

// ========== 联系人相关 ==========

export interface InitContactData {
  guid: string
  contact_seq?: number
  room_seq?: number
}

export interface GetContactDetailData {
  guid: string
  username: string
}

export interface BatchGetContactData {
  guid: string
  username_list: string[]
}

// ========== 群组相关 ==========

export interface GetRoomDetailData {
  guid: string
  room_username: string
}

export interface GetRoomMemberDetailData {
  guid: string
  room_username: string
  version?: number
}

export interface CreateChatRoomData {
  guid: string
  username_list: string[]
}

export interface AddChatRoomMemberData {
  guid: string
  room_username: string
  username_list: string[]
}

// ========== Webhook 回调消息格式 ==========

export interface ChatMsgModel {
  from_username: string
  to_username: string
  chatroom_sender: string
  create_time: number
  desc: string
  msg_id: string
  msg_type: number
  chatroom: string
  source: string
  content: string
}

// 文本消息 (msg_type: 1)
export interface TextMessage extends ChatMsgModel {
  msg_type: 1
}

// 图片消息 (msg_type: 3)
export interface ImageMessage extends ChatMsgModel {
  msg_type: 3
}

// 语音消息 (msg_type: 34)
export interface VoiceMessage extends ChatMsgModel {
  msg_type: 34
}

// 视频消息 (msg_type: 43)
export interface VideoMessage extends ChatMsgModel {
  msg_type: 43
}

// 表情消息 (msg_type: 47)
export interface EmojiMessage extends ChatMsgModel {
  msg_type: 47
}

// 应用消息/链接/文件 (msg_type: 49)
export interface AppMessage extends ChatMsgModel {
  msg_type: 49
}

// 语音/视频通话 (msg_type: 51)
export interface VoiceVideoCallMessage extends ChatMsgModel {
  msg_type: 51
}

// 系统消息 (msg_type: 10000)
export interface SystemMessage extends ChatMsgModel {
  msg_type: 10000
}

// 消息撤回 (msg_type: 10002)
export interface MessageRecallMessage extends ChatMsgModel {
  msg_type: 10002
}

// 消息联合类型
export type Message =
  | TextMessage
  | ImageMessage
  | VoiceMessage
  | VideoMessage
  | EmojiMessage
  | AppMessage
  | VoiceVideoCallMessage
  | SystemMessage
  | MessageRecallMessage

// ========== API 路径常量 ==========

export const API_PATHS = {
  // 客户端
  RESTORE_CLIENT: '/client/restore_client',
  CREATE_CLIENT: '/client/create_client',
  GET_CLIENT_STATUS: '/client/get_client_status',
  SET_NOTIFY_URL: '/client/set_notify_url',

  // 消息
  SEND_TEXT: '/msg/send_text',
  SEND_IMAGE: '/msg/send_image',

  // 联系人
  INIT_CONTACT: '/contact/init_contact',
  GET_CONTACT_DETAIL: '/contact/get_contact_detail',
  BATCH_GET_CONTACT: '/contact/batch_get_contact',

  // 群组
  GET_ROOM_DETAIL: '/room/get_room_detail',
  GET_ROOM_MEMBER_DETAIL: '/room/get_room_member_detail',
  CREATE_CHAT_ROOM: '/room/create_chat_room',
  ADD_CHAT_ROOM_MEMBER: '/room/add_chat_room_member',
} as const
