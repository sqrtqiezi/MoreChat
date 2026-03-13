# 多尺寸图片支持 + Lightbox 查看

## 背景

当前图片获取仅支持中图（`file_type=2`）。微信图片消息的 XML 中包含三种尺寸（thumb/mid/hd），且 juhexbot cloud/download API 通过 `file_type` 参数区分尺寸（1=HD, 2=mid, 3=thumb），fileId 相同。

用户需求：第一次点击加载中图在消息气泡内显示，再次点击图片时弹出 lightbox 并加载高清大图，支持长截图垂直滚动。

本次范围仅涉及 mid 和 hd，thumb 不在范围内。

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
- HD 下载失败（网络错误、API 超时）时：保持 mid 图显示，不额外提示
- `pendingRequests` 去重 key 从 `msgId` 改为 `${msgId}:${size}`，避免 mid/hd 并发请求互相干扰
- 返回 `{ imageUrl, hasHd }`

### routes/messages.ts

读取 `c.req.query('size')`，传给 `imageService.getImageUrl()`，返回 `{ imageUrl, hasHd }`。

### ImageCache 表

不改。HD URL 直接覆盖 mid URL。cloud download 返回的 URL 是 OSS 永久链接（非临时签名 URL），无过期问题。

## 前端改动

### chat.ts (API 层)

- `getImageUrl(msgId, size?)` 增加 `size` 参数，拼接 query string
- 返回类型改为 `{ imageUrl: string; hasHd: boolean }`
- 所有调用点（MessageItem、ReferImage）适配新的返回类型

### MessageItem.tsx

图片消息渲染流程：

1. 初始状态：「点击查看图片」按钮（不变）
2. 第一次点击：调用 `getImageUrl(msgId)` 加载 mid 图，从返回值中解构 `{ imageUrl, hasHd }`，在消息气泡内展示
3. 点击已加载的图片：打开 lightbox，同时如果 `hasHd=true` 则请求 `getImageUrl(msgId, 'hd')`，加载完后 lightbox 内图片升级为 HD
4. HD 加载失败时：lightbox 继续显示 mid 图，不提示错误

### Lightbox 组件

- 使用第三方库 `yet-another-react-lightbox`
- 全屏遮罩，点击外部或按 ESC 关闭
- 长图处理：通过 `yet-another-react-lightbox` 的自定义 render 插件，对高宽比 > 2 的图片使用 `object-fit: contain` + `overflow-y: auto` 的容器，允许垂直滚动
- 先显示已有的 mid 图，HD 加载完后替换

### ReferImage 组件

- 适配 `getImageUrl` 新的返回类型 `{ imageUrl, hasHd }`
- 点击引用块中的图片缩略图时，打开 lightbox（复用同一个 lightbox 逻辑）
- 支持 HD 升级（如果 `hasHd=true`）

## 数据流

```
用户点击「查看图片」
  → getImageUrl(msgId)           → file_type=2 → mid URL + hasHd → 气泡内显示
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

- **messageContentProcessor.test.ts**：`parseImageXml` 的 `hasHd` 字段测试（有 hdlength / 无 hdlength）
- **imageService.test.ts**：`size=hd` 测试用例（有大图 / 无大图 fallback / HD 下载失败 fallback）
- **juhexbotAdapter.test.ts**：`downloadImage` 的 `fileType` 参数传递测试
- **route 层**：`size` query 参数解析测试
- 前端无组件测试（项目现状无前端组件测试框架）

## 验证结果

通过服务器实测确认：

| file_type | 下载大小 | 对应字段 | 说明 |
|-----------|---------|----------|------|
| 1 | 301,972 | hdlength | HD 原图 |
| 2 | 298,288 | length | 中图 |
| 3 | 4,231 | cdnthumblength | 缩略图 |
| 4 | 错误 | - | 不支持 |

三种尺寸使用同一个 fileId，仅靠 `file_type` 区分。1174 条图片消息中 446 条有 `hdlength`，所有消息的 cdnthumburl / cdnmidimgurl / cdnbigimgurl 的 fileId 完全一致。cloud download 返回的 URL 为 OSS 永久链接。

---

## 实施状态

✅ **已完成** (2026-03-13)

### 实施计划
详见：`docs/superpowers/plans/2026-03-13-multi-size-image-lightbox.md`

### 测试结果
- ✅ 后端单元测试全部通过
- ✅ 前端类型检查通过
- ✅ 端到端测试通过
- ✅ 缓存机制验证通过
- ✅ 并发去重验证通过

### 关键文件
- `apps/server/src/services/messageContentProcessor.ts` - XML 解析 hasHd
- `apps/server/src/services/juhexbotAdapter.ts` - fileType 参数
- `apps/server/src/services/imageService.ts` - 多尺寸支持
- `apps/server/src/routes/messages.ts` - size 查询参数
- `apps/web/src/api/chat.ts` - API 客户端
- `apps/web/src/components/chat/ImageLightbox.tsx` - Lightbox 组件
- `apps/web/src/components/chat/MessageItem.tsx` - 集成
