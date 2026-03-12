# 多尺寸图片支持 + Lightbox 查看

## 背景

当前图片获取仅支持中图（`file_type=2`）。微信图片消息的 XML 中包含三种尺寸（thumb/mid/hd），且 juhexbot cloud/download API 通过 `file_type` 参数区分尺寸（1=HD, 2=mid, 3=thumb），fileId 相同。

用户需求：第一次点击加载中图在消息气泡内显示，再次点击图片时弹出 lightbox 并加载高清大图，支持长截图垂直滚动。

## API 变更

`GET /api/messages/:msgId/image?size=mid|hd`

- `size` 可选，默认 `mid`
- `mid` → `file_type=2`
- `hd` → `file_type=1`
- 返回值从 `{ imageUrl: string }` 改为 `{ imageUrl: string; hasHd: boolean }`

## 后端改动

### juhexbotAdapter.ts

`downloadImage(aesKey, fileId, fileName, fileType?)` 增加可选参数 `fileType`，默认 2。

### messageContentProcessor.ts

`parseImageXml` 返回值增加 `hasHd: boolean`（根据 XML 中 `hdlength` 属性存在且 > 0 判断）。

`ImageInfo` 变为：

```typescript
interface ImageInfo {
  aesKey: string
  fileId: string
  hasHd: boolean
}
```

### imageService.ts

`getImageUrl(msgId, size?)` 增加 `size` 参数：

- `size=mid`（默认）：行为不变，`file_type=2`
- `size=hd`：检查 `hasHd`，若有则用 `fileType=1` 调用 cloud API
- `size=hd` 但无大图：fallback 到 mid
- 成功获取 HD URL 后，覆盖 ImageCache 中的 `downloadUrl`（只升不降）
- 返回 `{ imageUrl, hasHd }`

### routes/messages.ts

读取 `c.req.query('size')`，传给 `imageService.getImageUrl()`，返回 `{ imageUrl, hasHd }`。

### ImageCache 表

不改。HD URL 直接覆盖 mid URL。

## 前端改动

### chat.ts (API 层)

- `getImageUrl(msgId, size?)` 增加 `size` 参数
- 返回类型改为 `{ imageUrl: string; hasHd: boolean }`

### MessageItem.tsx

图片消息渲染流程：

1. 初始状态：「点击查看图片」按钮（不变）
2. 第一次点击：加载 mid 图，在消息气泡内展示（不变）
3. 点击已加载的图片：打开 lightbox，同时请求 `?size=hd`（如果 `hasHd=true`），加载完后 lightbox 内图片升级为 HD

### Lightbox 组件

- 使用第三方库 `yet-another-react-lightbox`
- 全屏遮罩，点击外部或按 ESC 关闭
- 长图（高宽比 > 2）时允许垂直滚动浏览
- 先显示已有的 mid 图，HD 加载完后替换

### ReferImage 组件

点击引用块中的图片缩略图时，也打开 lightbox。

## 数据流

```
用户点击「查看图片」
  → getImageUrl(msgId)           → file_type=2 → mid URL → 气泡内显示
用户点击图片
  → 打开 lightbox（先用 mid URL）
  → if hasHd: getImageUrl(msgId, 'hd') → file_type=1 → HD URL
  → 替换 lightbox 图片
  → ImageCache.downloadUrl 被 HD URL 覆盖
  → 下次打开同一图片直接用 HD URL
```

## 第三方依赖

- `yet-another-react-lightbox`：React lightbox 组件，MIT 协议

## 测试

- **messageContentProcessor.test.ts**：`parseImageXml` 的 `hasHd` 字段测试
- **imageService.test.ts**：`size=hd` 测试用例（有大图 / 无大图 fallback）
- **juhexbotAdapter.test.ts**：`downloadImage` 的 `fileType` 参数传递测试
- **route 层**：`size` query 参数解析测试

## 验证结果

通过服务器实测确认：

| file_type | 下载大小 | 对应字段 | 说明 |
|-----------|---------|----------|------|
| 1 | 301,972 | hdlength | HD 原图 |
| 2 | 298,288 | length | 中图 |
| 3 | 4,231 | cdnthumblength | 缩略图 |
| 4 | 错误 | - | 不支持 |

三种尺寸使用同一个 fileId，仅靠 `file_type` 区分。1174 条图片消息中 446 条有 `hdlength`，所有消息的 cdnthumburl / cdnmidimgurl / cdnbigimgurl 的 fileId 完全一致。
