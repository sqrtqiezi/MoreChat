# 端到端测试指南

本文档说明如何在本地环境运行 MoreChat 的端到端测试。

## 前置要求

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- 本地数据库（SQLite）

## 快速开始

### 1. 设置测试环境

运行环境检查脚本：

```bash
bash scripts/setup-test-env.sh
```

该脚本会检查：
- Node.js 和 pnpm 版本
- 项目依赖
- 配置文件
- 数据库目录
- Playwright 浏览器

### 2. 配置环境变量

确保 `apps/server/.env` 文件存在并配置正确：

```bash
# 测试环境的关键配置
DATABASE_URL="file:../data/morechat.db"
DATA_LAKE_PATH="./data/lake"
PORT=3100
NODE_ENV="development"

# 认证配置（测试密码：test123）
AUTH_PASSWORD_HASH="$2b$10$xhaDIjVx7SyJJlulTxfLvuiqdo5cOeJqLvZlDJdwiQgjCVOgqNuh."
AUTH_JWT_SECRET="dev-jwt-secret-change-in-production"

# 禁用嵌入功能（避免 onnxruntime 依赖问题）
EMBEDDING_ENABLED=false
```

### 3. 初始化数据库

如果是首次运行，需要创建数据库：

```bash
cd apps/server
npx prisma migrate dev
cd ../..
```

### 4. 启动本地服务

**需要开启 3 个终端窗口：**

**终端 1 - 启动后端服务：**
```bash
cd apps/server
pnpm dev
```

等待看到：
```
✅ Server started on http://localhost:3100
```

**终端 2 - 启动前端服务：**
```bash
cd apps/web
pnpm dev
```

等待看到：
```
  ➜  Local:   http://localhost:3000/
```

**终端 3 - 运行测试：**
```bash
cd apps/web
pnpm test:e2e
```

## 测试命令

| 命令 | 说明 |
|------|------|
| `pnpm test:e2e` | 运行所有端到端测试 |
| `pnpm test:e2e:ui` | 在 UI 模式下运行测试（可视化） |
| `pnpm test:e2e:debug` | 调试模式运行测试 |

## 测试配置

测试配置文件：`apps/web/playwright.config.ts`

关键配置：
- **baseURL**: `http://localhost:3000` - 前端地址
- **webServer**: 自动启动前后端服务
  - 后端：`http://localhost:3100`
  - 前端：`http://localhost:3000`

## 测试数据

### 测试账号

- **密码**: `test123`
- 对应的 hash: `$2b$10$xhaDIjVx7SyJJlulTxfLvuiqdo5cOeJqLvZlDJdwiQgjCVOgqNuh.`

### 测试数据准备

如果需要测试数据，可以：

1. **从生产环境抓取样本数据**（已有脚本）
2. **手动创建测试数据**
3. **使用 API 创建测试数据**

## 测试结构

```
apps/web/
├── e2e/                      # 端到端测试目录
│   ├── auth.e2e.spec.ts     # 认证与登录测试
│   ├── chat.e2e.spec.ts     # 聊天功能测试（待实现）
│   ├── search.e2e.spec.ts   # 搜索功能测试（待实现）
│   └── ...
├── playwright.config.ts      # Playwright 配置
├── playwright-report/        # 测试报告（自动生成）
└── test-results/            # 测试结果（自动生成）
```

## 常见问题

### 1. 端口被占用

如果 3000 或 3100 端口被占用，测试会失败。解决方法：

```bash
# 查找占用端口的进程
lsof -i :3000
lsof -i :3100

# 杀死进程
kill -9 <PID>
```

### 2. 数据库锁定

如果数据库被锁定，重启测试即可。

### 3. Playwright 浏览器未安装

```bash
cd apps/web
npx playwright install chromium
```

### 4. 测试超时

如果服务启动慢，可以增加 `playwright.config.ts` 中的 `webServer.timeout`。

## 调试测试

### 使用 UI 模式

```bash
pnpm test:e2e:ui
```

这会打开 Playwright UI，可以：
- 查看测试执行过程
- 逐步调试
- 查看网络请求
- 查看控制台日志

### 使用调试模式

```bash
pnpm test:e2e:debug
```

这会打开浏览器并暂停在第一个测试，可以：
- 使用浏览器开发者工具
- 逐步执行测试
- 查看页面状态

### 查看测试报告

测试完成后，会生成 HTML 报告：

```bash
npx playwright show-report
```

## CI/CD 集成

在 CI 环境中，测试会：
- 自动安装依赖
- 自动启动服务
- 运行所有测试
- 生成测试报告

环境变量：
- `CI=true` - 启用 CI 模式
- 测试失败会重试 2 次

## 测试最佳实践

1. **测试隔离**：每个测试应该独立，不依赖其他测试
2. **清理状态**：测试前清除 localStorage、cookies
3. **等待元素**：使用 `waitFor` 而不是固定延迟
4. **选择器稳定**：优先使用 `role`、`label` 等语义选择器
5. **截图和视频**：失败时自动保存，便于调试

## 下一步

- [ ] 实现聊天功能测试
- [ ] 实现搜索功能测试
- [ ] 实现 Feed 和 Topics 测试
- [ ] 添加性能测试
- [ ] 添加可访问性测试
