import { describe, it, expect } from 'vitest'
import { processMessageContent, parseImageXml } from './messageContentProcessor.js'

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

    it('should return [链接] when title is empty or missing', () => {
      const xmlContent = '<?xml version="1.0"?>\n<msg>\n\t<appmsg appid="" sdkver="0">\n\t\t<title></title>\n\t\t<type>5</type>\n\t</appmsg>\n</msg>'
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({ displayType: 'link', displayContent: '[链接]' })
    })
  })

  describe('Type 49 - Quote (type 57)', () => {
    it('should parse quote message with text referMsg', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>引用的消息</title>
    <type>57</type>
    <refermsg>
      <type>1</type>
      <svrid>123456</svrid>
      <fromusr>wxid_abc</fromusr>
      <chatusr>wxid_xyz</chatusr>
      <displayname>小明</displayname>
      <content>这是被引用的文本</content>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '引用的消息',
        referMsg: {
          type: 1,
          senderName: '小明',
          content: '这是被引用的文本',
          msgId: '123456'
        }
      })
    })

    it('should parse quote message with image referMsg', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>回复了图片</title>
    <type>57</type>
    <refermsg>
      <type>3</type>
      <svrid>789</svrid>
      <fromusr>wxid_def</fromusr>
      <chatusr>wxid_xyz</chatusr>
      <displayname>小红</displayname>
      <content>&lt;msg&gt;&lt;img aeskey="key123" /&gt;&lt;/msg&gt;</content>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '回复了图片',
        referMsg: {
          type: 3,
          senderName: '小红',
          content: '[图片]',
          msgId: '789'
        }
      })
    })

    it('should parse quote message with link referMsg (type 49)', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>回复了链接</title>
    <type>57</type>
    <refermsg>
      <type>49</type>
      <svrid>999</svrid>
      <fromusr>wxid_ghi</fromusr>
      <chatusr>wxid_xyz</chatusr>
      <displayname>小刚</displayname>
      <content>&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;分享的文章&lt;/title&gt;&lt;type&gt;5&lt;/type&gt;&lt;/appmsg&gt;&lt;/msg&gt;</content>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '回复了链接',
        referMsg: {
          type: 49,
          senderName: '小刚',
          content: '分享的文章',
          msgId: '999'
        }
      })
    })

    it('should parse quote message with video referMsg (finderFeed)', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>回复了视频号</title>
    <type>57</type>
    <refermsg>
      <type>49</type>
      <svrid>888</svrid>
      <fromusr>wxid_jkl</fromusr>
      <chatusr>wxid_xyz</chatusr>
      <displayname>小李</displayname>
      <content>&lt;msg&gt;&lt;appmsg&gt;&lt;title&gt;视频&lt;/title&gt;&lt;type&gt;51&lt;/type&gt;&lt;finderFeed&gt;&lt;nickname&gt;UP主&lt;/nickname&gt;&lt;desc&gt;精彩内容&lt;/desc&gt;&lt;/finderFeed&gt;&lt;/appmsg&gt;&lt;/msg&gt;</content>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '回复了视频号',
        referMsg: {
          type: 49,
          senderName: '小李',
          content: '[视频号] UP主: 精彩内容',
          msgId: '888'
        }
      })
    })

    it('should parse quote message with call referMsg (type 51)', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>回复了通话</title>
    <type>57</type>
    <refermsg>
      <type>51</type>
      <svrid>777</svrid>
      <fromusr>wxid_mno</fromusr>
      <chatusr>wxid_xyz</chatusr>
      <displayname>小王</displayname>
      <content>&lt;msg&gt;&lt;op id="5"&gt;&lt;/op&gt;&lt;/msg&gt;</content>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '回复了通话',
        referMsg: {
          type: 51,
          senderName: '小王',
          content: '[语音/视频通话]',
          msgId: '777'
        }
      })
    })

    it('should parse quote message with recall referMsg (type 10002)', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>回复了撤回消息</title>
    <type>57</type>
    <refermsg>
      <type>10002</type>
      <svrid>666</svrid>
      <fromusr>wxid_pqr</fromusr>
      <chatusr>wxid_xyz</chatusr>
      <displayname>小张</displayname>
      <content>&lt;sysmsg&gt;&lt;revokemsg&gt;&lt;replacemsg&gt;&lt;![CDATA["小张" 撤回了一条消息]]&gt;&lt;/replacemsg&gt;&lt;/revokemsg&gt;&lt;/sysmsg&gt;</content>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '回复了撤回消息',
        referMsg: {
          type: 10002,
          senderName: '小张',
          content: '"小张" 撤回了一条消息',
          msgId: '666'
        }
      })
    })

    it('should parse quote message with unknown type referMsg', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>回复了未知消息</title>
    <type>57</type>
    <refermsg>
      <type>999</type>
      <svrid>555</svrid>
      <fromusr>wxid_stu</fromusr>
      <chatusr>wxid_xyz</chatusr>
      <displayname>小赵</displayname>
      <content>未知内容</content>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '回复了未知消息',
        referMsg: {
          type: 999,
          senderName: '小赵',
          content: '[不支持的消息类型]',
          msgId: '555'
        }
      })
    })

    it('should handle quote message with missing refermsg fields', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>引用消息</title>
    <type>57</type>
    <refermsg>
      <type>1</type>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '引用消息',
        referMsg: {
          type: 1,
          senderName: '',
          content: '',
          msgId: ''
        }
      })
    })

    it('should handle quote message with empty title', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title></title>
    <type>57</type>
    <refermsg>
      <type>1</type>
      <svrid>123</svrid>
      <fromusr>wxid_abc</fromusr>
      <chatusr>wxid_xyz</chatusr>
      <displayname>小明</displayname>
      <content>文本内容</content>
    </refermsg>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'quote',
        displayContent: '[引用消息]',
        referMsg: {
          type: 1,
          senderName: '小明',
          content: '文本内容',
          msgId: '123'
        }
      })
    })

    it('should fallback to link when type=57 but no refermsg', () => {
      const xmlContent = `<?xml version="1.0"?>
<msg>
  <appmsg appid="" sdkver="0">
    <title>普通标题</title>
    <type>57</type>
  </appmsg>
</msg>`
      const result = processMessageContent(49, xmlContent)
      expect(result).toEqual({
        displayType: 'link',
        displayContent: '普通标题'
      })
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

    it('should handle invalid XML content gracefully', () => {
      const result = processMessageContent(10002, 'not xml at all')
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

describe('parseImageXml', () => {
  it('should parse valid encrypted image XML', () => {
    const xml = `<?xml version="1.0"?>
<msg>
    <img aeskey="test_aes_key_123" cdnmidimgurl="test_cdn_url_456" encryver="1" md5="abc123" length="12345"/>
</msg>`

    const result = parseImageXml(xml)

    expect(result).toEqual({
      aesKey: 'test_aes_key_123',
      fileId: 'test_cdn_url_456'
    })
  })

  it('should return null for non-encryver-1 images', () => {
    const xml = `<?xml version="1.0"?>
<msg>
    <img aeskey="key" cdnmidimgurl="url" encryver="0"/>
</msg>`

    expect(parseImageXml(xml)).toBeNull()
  })

  it('should return null for invalid XML', () => {
    expect(parseImageXml('not xml')).toBeNull()
    expect(parseImageXml('')).toBeNull()
  })

  it('should return null for missing required fields', () => {
    const xml = `<?xml version="1.0"?>
<msg>
    <img encryver="1"/>
</msg>`

    expect(parseImageXml(xml)).toBeNull()
  })
})
