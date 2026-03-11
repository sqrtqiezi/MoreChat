# 修复消息发送者身份识别

## 问题

系统使用 juhexbot UUID (`7092457f-325f-3b3a-bf8e-a30b4dcaf74b`) 作为登录用户标识，但 webhook 消息中使用的是微信用户名 (`njin_cool`)。导致：

1. `JuhexbotAdapter.getConversationId()` 中 `fromUsername === clientGuid` 永远为 false，自己发的消息被归到错误的会话
2. `MessageService.sendMessage()` 存储 `from_username: ''`，丢失发送者信息
3. 前端硬编码 `CURRENT_USER = 'wxid_test_user'`，`isMine` 判断永远为 false
4. 所有会话中自己发的消息都显示在左侧（对方侧）

## 数据验证

**webhook 实际数据：**
- 自己发的：`from_username: "njin_cool"`, `to_username: "filehelper"`
- 别人发的：`from_username: "wxid_abw19y0lhwkt12"`, `to_username: "njin_cool"`

**`/user/get_profile` API 返回：**
- `userName.string: "njin_cool"`
- `nickName.string: "牛晋"`
- `smallHeadImgUrl: "https://wx.qlogo.cn/mmhead/..."`

## 设计

### 1. JuhexbotAdapter 新增 `getProfile()`

调用 `/user/get_profile`，返回 `{ username, nickname, avatar }`。

### 2. 服务启动时获取并存储 clientUsername

`index.ts` 启动流程中调用 `getProfile()`，将 `username` 存入 Client 表的新字段 `username`，并传入 app config。

### 3. 修复 `getConversationId()`

```typescript
// before
if (parsed.message.fromUsername === this.config.clientGuid) {
// after
if (parsed.message.fromUsername === this.config.clientUsername) {
```

### 4. 修复 `sendMessage()` 的 from_username

```typescript
// before
from_username: '',
// after
from_username: this.clientUsername,
```

### 5. 新增 `/api/me` 接口

返回当前登录用户信息：

```json
{ "username": "njin_cool", "nickname": "牛晋", "avatar": "https://..." }
```

### 6. 前端使用真实用户标识

- 启动时调用 `/api/me` 获取 username
- 替换硬编码的 `CURRENT_USER`
- `mapMessage()` 用真实 username 判断 `isMine`

## 改动文件

| 文件 | 改动 |
|------|------|
| `apps/server/src/services/juhexbotAdapter.ts` | 新增 `getProfile()` 方法 |
| `apps/server/src/services/juhexbotAdapter.ts` | `getConversationId()` 用 `clientUsername` |
| `apps/server/src/services/message.ts` | `sendMessage()` 填充真实 `from_username` |
| `apps/server/src/app.ts` | config 增加 `clientUsername` |
| `apps/server/src/index.ts` | 启动时调用 `getProfile()` |
| `apps/server/src/routes/` | 新增 me route |
| `apps/web/src/api/chat.ts` | 动态获取 username，修复 `isMine` |
