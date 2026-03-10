import { XMLParser } from 'fast-xml-parser'

export type DisplayType = 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'unknown'

export interface ProcessedContent {
  displayType: DisplayType
  displayContent: string
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
})

function parseXml(content: string): any | null {
  try {
    return xmlParser.parse(content)
  } catch {
    return null
  }
}

function processType49(content: string): ProcessedContent {
  const parsed = parseXml(content)
  if (!parsed) {
    return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }

  const appmsg = parsed?.msg?.appmsg
  if (!appmsg) {
    return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }

  // Check for finderFeed (video channel) — type 51 within appmsg
  const finderFeed = appmsg.finderFeed
  if (finderFeed && finderFeed.nickname) {
    const nickname = String(finderFeed.nickname).trim()
    const desc = String(finderFeed.desc || '').trim()
    if (nickname) {
      const summary = desc ? `${nickname}: ${desc}` : nickname
      return { displayType: 'video', displayContent: `[视频号] ${summary}` }
    }
  }

  // Default: use title
  const title = appmsg.title ? String(appmsg.title).trim() : ''
  return {
    displayType: 'link',
    displayContent: title || '[链接]',
  }
}

function processType10002(content: string): ProcessedContent {
  const parsed = parseXml(content)
  const replacemsg = parsed?.sysmsg?.revokemsg?.replacemsg
  const text = replacemsg ? String(replacemsg).trim() : '撤回了一条消息'
  return { displayType: 'recall', displayContent: text }
}

export function processMessageContent(msgType: number, content: string): ProcessedContent {
  switch (msgType) {
    case 1:
      return { displayType: 'text', displayContent: content }
    case 3:
      return { displayType: 'image', displayContent: '[图片]' }
    case 49:
      return processType49(content)
    case 51:
      return { displayType: 'call', displayContent: '[语音/视频通话]' }
    case 10002:
      return processType10002(content)
    default:
      return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }
}
