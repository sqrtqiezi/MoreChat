import { XMLParser } from 'fast-xml-parser'

export type DisplayType = 'text' | 'image' | 'link' | 'video' | 'call' | 'recall' | 'quote' | 'emoji' | 'file' | 'unknown'

export interface ReferMsg {
  type: number
  senderName: string
  content: string
  msgId: string
}

export interface ProcessedContent {
  displayType: DisplayType
  displayContent: string
  referMsg?: ReferMsg
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
})

function parseXml(content: string): any | null {
  try {
    const result = xmlParser.parse(content)
    if (!result || typeof result !== 'object' || Object.keys(result).length === 0) {
      return null
    }
    return result
  } catch {
    return null
  }
}

function summarizeReferContent(referType: number, referContent: string): string {
  if (!referContent || !referContent.trim()) {
    return ''
  }

  switch (referType) {
    case 1:
      return referContent
    case 3:
      return '[图片]'
    case 49: {
      const parsed = parseXml(referContent)
      const appmsg = parsed?.msg?.appmsg
      if (!appmsg) {
        return '[链接]'
      }

      const appType = appmsg.type ? Number(appmsg.type) : 0
      if (appType === 6) {
        const title = appmsg.title ? String(appmsg.title).trim() : ''
        return title ? `[文件] ${title}` : '[文件]'
      }

      const finderFeed = appmsg.finderFeed
      if (finderFeed && finderFeed.nickname) {
        const nickname = String(finderFeed.nickname).trim()
        const desc = String(finderFeed.desc || '').trim()
        if (nickname) {
          return desc ? `[视频号] ${nickname}: ${desc}` : `[视频号] ${nickname}`
        }
      }

      const title = appmsg.title ? String(appmsg.title).trim() : ''
      return title || '[链接]'
    }
    case 51:
      return '[语音/视频通话]'
    case 10002: {
      const parsed = parseXml(referContent)
      const replacemsg = parsed?.sysmsg?.revokemsg?.replacemsg
      return replacemsg ? String(replacemsg).trim() : '撤回了一条消息'
    }
    default:
      return '[不支持的消息类型]'
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

  const msgType = appmsg.type ? Number(appmsg.type) : 0

  // Check for quote message (type 57)
  if (msgType === 57) {
    const refermsg = appmsg.refermsg
    if (refermsg) {
      const referType = refermsg.type ? Number(refermsg.type) : 0
      const svrid = refermsg.svrid ? String(refermsg.svrid).trim() : ''
      const displayname = refermsg.displayname ? String(refermsg.displayname).trim() : ''
      const referContent = refermsg.content ? String(refermsg.content).trim() : ''

      const contentSummary = summarizeReferContent(referType, referContent)

      const title = appmsg.title ? String(appmsg.title).trim() : ''
      return {
        displayType: 'quote',
        displayContent: title || '[引用消息]',
        referMsg: {
          type: referType,
          senderName: displayname,
          content: contentSummary,
          msgId: svrid
        }
      }
    }
    // Fallback to link if no refermsg
    const title = appmsg.title ? String(appmsg.title).trim() : ''
    const url = appmsg.url ? String(appmsg.url).trim() : ''
    const des = appmsg.des ? String(appmsg.des).trim() : ''
    return {
      displayType: 'link',
      displayContent: JSON.stringify({ title: title || '[链接]', url, des }),
    }
  }

  // Check for file message (type 6)
  if (msgType === 6) {
    const appattach = appmsg.appattach
    const cdnFileId = appattach?.cdnattachurl ? String(appattach.cdnattachurl).trim() : ''
    const aesKey = appattach?.aeskey ? String(appattach.aeskey).trim() : ''

    if (cdnFileId && aesKey) {
      const title = appmsg.title ? String(appmsg.title).trim() : ''
      const fileExt = appattach?.fileext ? String(appattach.fileext).trim() : ''
      const fileSize = appattach?.totallen ? Number(appattach.totallen) : 0
      return {
        displayType: 'file' as DisplayType,
        displayContent: JSON.stringify({ fileName: title || `file.${fileExt}`, fileExt, fileSize }),
      }
    }
  }

  // Skip file transfer notification (type 74) — duplicate of type 6
  if (msgType === 74) {
    return { displayType: 'unknown', displayContent: '' }
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

  // Default: use title (type 5 = link/article)
  const title = appmsg.title ? String(appmsg.title).trim() : ''
  const url = appmsg.url ? String(appmsg.url).trim() : ''
  const des = appmsg.des ? String(appmsg.des).trim() : ''
  return {
    displayType: 'link',
    displayContent: JSON.stringify({ title: title || '[链接]', url, des }),
  }
}

function processType47(content: string): ProcessedContent {
  return { displayType: 'emoji', displayContent: '[表情]' }
}

function processType10002(content: string): ProcessedContent {
  const parsed = parseXml(content)
  const replacemsg = parsed?.sysmsg?.revokemsg?.replacemsg
  const text = replacemsg ? String(replacemsg).trim() : '撤回了一条消息'
  return { displayType: 'recall', displayContent: text }
}

export function parseRecallXml(content: string): string | null {
  if (!content) return null

  const parsed = parseXml(content)
  const newmsgid = parsed?.sysmsg?.revokemsg?.newmsgid
  return newmsgid ? String(newmsgid) : null
}

export function processMessageContent(msgType: number, content: string): ProcessedContent {
  const safeContent = content ?? ''
  switch (msgType) {
    case 1:
      return { displayType: 'text', displayContent: safeContent }
    case 3:
      return { displayType: 'image', displayContent: '[图片]' }
    case 47:
      return processType47(safeContent)
    case 49:
      return processType49(safeContent)
    case 51:
      return { displayType: 'call', displayContent: '[语音/视频通话]' }
    case 10002:
      return processType10002(safeContent)
    default:
      return { displayType: 'unknown', displayContent: '[不支持的消息类型]' }
  }
}

export interface ImageInfo {
  aesKey: string
  fileId: string
  hasHd: boolean
}

export function parseImageXml(content: string): ImageInfo | null {
  if (!content || !content.trim()) {
    return null
  }

  const parsed = parseXml(content)
  if (!parsed) {
    return null
  }

  const img = parsed?.msg?.img
  if (!img) {
    return null
  }

  const encryver = img['@_encryver']
  if (encryver !== '1') {
    return null
  }

  const aesKey = img['@_aeskey']
  const cdnMidImgUrl = img['@_cdnmidimgurl']
  const hdlength = img['@_hdlength']

  if (!aesKey || !cdnMidImgUrl) {
    return null
  }

  const hasHd = hdlength && parseInt(hdlength, 10) > 0

  return {
    aesKey: String(aesKey),
    fileId: String(cdnMidImgUrl),
    hasHd: Boolean(hasHd)
  }
}

export interface FileInfo {
  fileName: string
  fileExt: string
  fileSize: number
  aesKey: string
  cdnFileId: string
  md5?: string
}

export function parseFileXml(content: string): FileInfo | null {
  if (!content || !content.trim()) {
    return null
  }

  const parsed = parseXml(content)
  if (!parsed) {
    return null
  }

  const appmsg = parsed?.msg?.appmsg
  if (!appmsg) {
    return null
  }

  const msgType = appmsg.type ? Number(appmsg.type) : 0
  if (msgType !== 6) {
    return null
  }

  const appattach = appmsg.appattach
  if (!appattach) {
    return null
  }

  const cdnFileId = appattach.cdnattachurl ? String(appattach.cdnattachurl).trim() : ''
  const aesKey = appattach.aeskey ? String(appattach.aeskey).trim() : ''

  if (!cdnFileId || !aesKey) {
    return null
  }

  const title = appmsg.title ? String(appmsg.title).trim() : ''
  const fileExt = appattach.fileext ? String(appattach.fileext).trim() : ''
  const fileSize = appattach.totallen ? Number(appattach.totallen) : 0
  const md5 = appmsg.md5 ? String(appmsg.md5).trim() : undefined

  return {
    fileName: title || `file.${fileExt}`,
    fileExt,
    fileSize,
    aesKey,
    cdnFileId,
    md5,
  }
}
