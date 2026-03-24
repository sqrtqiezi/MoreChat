# 链接消息图文卡片设计

Issue: #9 - 外链/微信公众号图文消息需要可以点开

## 问题

type=5 链接消息当前只显示为灰色斜体标题文本，不可点击，无法打开链接。

## 方案：后端扩展 displayContent + 前端 LinkMessage 组件

### 后端

修改 `messageContentProcessor.ts` type=5 分支，提取 `title`、`url`、`des`，JSON 序列化为 `displayContent`。

### 前端

新建 `LinkMessage` 组件：
- 解析 JSON displayContent，提取 title/url/des
- Fallback：JSON 解析失败时把字符串当 title（兼容旧数据）
- 简洁卡片样式：标题 + URL 域名
- 有 url 时可点击，`window.open(url, '_blank')`

### 涉及文件

| 文件 | 改动 |
|------|------|
| `messageContentProcessor.ts` | type=5 提取 title/url/des |
| `messageContentProcessor.test.ts` | 更新测试 |
| `LinkMessage.tsx`（新建） | 链接卡片组件 |
| `MessageItem.tsx` | 添加 link 分支 |
