import { describe, it, expect } from 'vitest'
import { processMessageContent } from './messageContentProcessor.js'

describe('processMessageContent', () => {
  describe('Type 1 - Text', () => {
    it('should return text content as-is', () => {
      const result = processMessageContent(1, '你好世界')
      expect(result).toEqual({ displayType: 'text', displayContent: '你好世界' })
    })

    it('should handle empty text', () => {
      const result = processMessageContent(1, '')
      expect(result).toEqual({ displayType: 'text', displayContent: '' })
    })
  })

  describe('Type 3 - Image', () => {
    it('should return image placeholder', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<img aeskey="abc" cdnthumburl="http://example.com/thumb" />\n</msg>'
      const result = processMessageContent(3, xmlContent)
      expect(result).toEqual({ displayType: 'image', displayContent: '[图片]' })
    })
  })

  describe('Type 49 - App/Link/File', () => {
    it('should extract title from appmsg', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title>测试链接标题</title>\n\t\t<type>5</type>\n\t\t<url>https://example.com</url>\n\t</appmsg>\n</msg>'
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({ displayType: 'link', displayContent: '测试链接标题' })
    })

    it('should extract finderFeed info for video type', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title>当前版本不支持展示该内容</title>\n\t\t<type>51</type>\n\t\t<finderFeed>\n\t\t\t<nickname>小明</nickname>\n\t\t\t<desc>有趣的视频</desc>\n\t\t</finderFeed>\n\t</appmsg>\n</msg>'
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({ displayType: 'video', displayContent: '[视频号] 小明: 有趣的视频' })
    })

    it('should fallback to title when finderFeed has no nickname', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title>分享的文章</title>\n\t\t<type>51</type>\n\t\t<finderFeed>\n\t\t\t<nickname></nickname>\n\t\t</finderFeed>\n\t</appmsg>\n</msg>'
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({ displayType: 'link', displayContent: '分享的文章' })
    })

    it('should handle XML parse failure gracefully', () => {
      const result = processMessageContent(49, 'not xml at all')
      expect(result).toEqual({ displayType: 'unknown', displayContent: '[不支持的消息类型]' })
    })
  })

  describe('Type 51 - Voice/Video Call', () => {
    it('should return call placeholder', () => {
      const xmlContent = '<msg>\n<op id="5">\n<username>filehelper</username>\n</op>\n</msg>'
      const result = processMessageContent(51, xmlContent)
      expect(result).toEqual({ displayType: 'call', displayContent: '[语音/视频通话]' })
    })
  })

  describe('Type 10002 - Message Recall', () => {
    it('should extract replacemsg text', () => {
      const xmlContent = '<sysmsg type="revokemsg"><revokemsg><session>user1</session><replacemsg><![CDATA["小明" 撤回了一条消息]]></replacemsg></revokemsg></sysmsg>'
      const result = processMessageContent(10002, xmlContent)
      expect(result).toEqual({ displayType: 'recall', displayContent: '"小明" 撤回了一条消息' })
    })

    it('should handle missing replacemsg', () => {
      const xmlContent = '<sysmsg type="revokemsg"><revokemsg><session>user1</session></revokemsg></sysmsg>'
      const result = processMessageContent(10002, xmlContent)
      expect(result).toEqual({ displayType: 'recall', displayContent: '撤回了一条消息' })
    })
  })

  describe('Unknown types', () => {
    it('should return unknown for unrecognized msg type', () => {
      const result = processMessageContent(999, 'some content')
      expect(result).toEqual({ displayType: 'unknown', displayContent: '[不支持的消息类型]' })
    })
  })
})
