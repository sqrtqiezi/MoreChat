# VPS 部署配置指南

本文档说明如何配置 MoreChat 在 VPS 上运行所需的所有环境变量。

## 配置文件位置

生产环境配置文件：`apps/server/.env`

## 必需的环境变量

### 1. 数据库配置

```bash
DATABASE_URL="file:../data/morechat.db"
```

- SQLite 数据库文件路径
- 相对于 `apps/server/` 目录
- 部署时会自动创建 `apps/server/data/` 目录

### 2. Data Lake 配置

```bash
DATA_LAKE_TYPE="filesystem"
DATA_LAKE_PATH="./data/lake"
```

- `DATA_LAKE_TYPE`: 存储类型，目前只支持 `filesystem`
- `DATA_LAKE_PATH`: 消息原始数据存储路径，相对于 `apps/server/`

### 3. 服务器配置

```bash
PORT=3100
NODE_ENV="production"
CORS_ORIGIN=""
```

- `PORT`: 后端监听端口，默认 3100
- `NODE_ENV`: 环境模式，生产环境必须设为 `production`
- `CORS_ORIGIN`: CORS 允许的源，同源部署可留空

### 4. juhexbot API 配置

```bash
JUHEXBOT_API_URL="http://chat-api.juhebot.com/open/GuidRequest"
JUHEXBOT_APP_KEY="<your_app_key>"
JUHEXBOT_APP_SECRET="<your_app_secret>"
JUHEXBOT_CLIENT_GUID="<your_client_guid>"
```

**如何获取这些配置：**

1. 访问 juhexbot 官网注册账号
2. 创建应用获取 `APP_KEY` 和 `APP_SECRET`
3. 启动客户端获取 `CLIENT_GUID`

**重要提示：**
- 这些配置是 MoreChat 连接微信的核心凭证
- 请妥善保管，不要泄露
- `CLIENT_GUID` 对应一个微信客户端实例

### 5. 认证配置

```bash
AUTH_PASSWORD_HASH="<bcrypt_hash>"
AUTH_JWT_SECRET="<random_string>"
```

**生成密码哈希：**

```bash
cd apps/server
pnpm hash-password
# 输入密码后会生成 bcrypt hash
```

**生成 JWT 密钥：**

```bash
# 方法 1: 使用 openssl
openssl rand -base64 32

# 方法 2: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 完整配置示例

创建 `apps/server/.env` 文件：

```bash
# Database
DATABASE_URL="file:../data/morechat.db"

# Data Lake
DATA_LAKE_TYPE="filesystem"
DATA_LAKE_PATH="./data/lake"

# Server
PORT=3100
NODE_ENV="production"
CORS_ORIGIN=""

# juhexbot API
JUHEXBOT_API_URL="http://chat-api.juhebot.com/open/GuidRequest"
JUHEXBOT_APP_KEY="abc123def456"
JUHEXBOT_APP_SECRET="xyz789uvw012"
JUHEXBOT_CLIENT_GUID="guid-1234-5678-90ab-cdef"

# Auth
AUTH_PASSWORD_HASH="$2a$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNO"
AUTH_JWT_SECRET="dGhpc19pc19hX3JhbmRvbV9zZWNyZXRfa2V5X2Zvcl9qd3Q="
```

## 部署步骤

### 首次部署

1. **SSH 到 VPS**

```bash
ssh user@your-vps-ip
```

2. **克隆仓库**

```bash
git clone https://github.com/your-username/MoreChat.git ~/morechat
cd ~/morechat
```

3. **运行初始化脚本**

```bash
bash deploy/setup.sh
```

这会安装 Node.js 20、pnpm、PM2、Nginx，并配置 Nginx。

4. **创建配置文件**

```bash
cd ~/morechat
cp apps/server/.env.example apps/server/.env
nano apps/server/.env
```

填入真实的配置值（参考上面的说明）。

5. **生成密码哈希**

```bash
cd ~/morechat/apps/server
pnpm hash-password
# 输入密码，复制生成的 hash 到 .env 的 AUTH_PASSWORD_HASH
```

6. **首次部署**

```bash
cd ~/morechat
bash deploy/update.sh
```

7. **验证部署**

```bash
# 检查服务状态
pm2 status

# 检查日志
pm2 logs morechat

# 健康检查
curl http://localhost:3100/health
```

### 后续更新

配置 GitHub Actions 自动部署：

1. **在 GitHub 仓库设置 Secrets**

进入仓库 Settings → Secrets and variables → Actions，添加：

- `VPS_HOST`: VPS IP 地址
- `VPS_USER`: SSH 用户名
- `VPS_SSH_KEY`: SSH 私钥（完整内容）
- `VPS_PORT`: SSH 端口（可选，默认 22）

2. **推送代码触发部署**

```bash
git push origin main
```

GitHub Actions 会自动 SSH 到 VPS 执行 `deploy/update.sh`。

## 故障排查

### 服务无法启动

```bash
# 查看 PM2 日志
pm2 logs morechat --lines 100

# 常见问题：
# 1. .env 文件缺少必需变量 → 检查 apps/server/.env
# 2. 数据库迁移失败 → 手动运行: cd apps/server && pnpm db:migrate:deploy
# 3. 端口被占用 → 修改 .env 中的 PORT
```

### juhexbot 连接失败

```bash
# 检查配置
cat apps/server/.env | grep JUHEXBOT

# 验证 API 可达性
curl -X POST http://chat-api.juhebot.com/open/GuidRequest \
  -H "Content-Type: application/json" \
  -d '{"app_key":"your_key","app_secret":"your_secret"}'
```

### Nginx 配置问题

```bash
# 测试配置
sudo nginx -t

# 重新加载
sudo systemctl reload nginx

# 查看日志
sudo tail -f /var/log/nginx/error.log
```

## 安全建议

1. **不要将 .env 文件提交到 Git**
   - 已在 .gitignore 中排除
   - 每个环境单独配置

2. **定期更换 JWT 密钥**
   - 更换后所有用户需要重新登录

3. **使用强密码**
   - 密码长度至少 12 位
   - 包含大小写字母、数字、特殊字符

4. **配置防火墙**
   ```bash
   # 只开放必要端口
   sudo ufw allow 22    # SSH
   sudo ufw allow 80    # HTTP
   sudo ufw allow 443   # HTTPS (如果配置了 SSL)
   sudo ufw enable
   ```

5. **配置 HTTPS**
   - 使用 Let's Encrypt 免费证书
   - 修改 `deploy/nginx.conf` 添加 SSL 配置

## 监控和维护

### 查看服务状态

```bash
pm2 status
pm2 monit
```

### 查看日志

```bash
# 实时日志
pm2 logs morechat

# 最近 100 行
pm2 logs morechat --lines 100
```

### 重启服务

```bash
pm2 restart morechat
```

### 数据库备份

```bash
# 备份数据库
cp ~/morechat/apps/server/data/morechat.db ~/backups/morechat-$(date +%Y%m%d).db

# 备份 Data Lake
tar -czf ~/backups/lake-$(date +%Y%m%d).tar.gz ~/morechat/apps/server/data/lake
```
