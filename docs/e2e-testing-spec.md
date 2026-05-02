# MoreChat E2E 测试规范

## 1. 概述

本文档定义了 MoreChat 项目的端到端（E2E）测试规范，使用 Cucumber + Playwright + TypeScript 技术栈。

## 2. 技术栈

- **测试框架**: Cucumber (BDD)
- **浏览器自动化**: Playwright
- **编程语言**: TypeScript
- **测试运行器**: @cucumber/cucumber
- **报告工具**: cucumber-html-reporter

## 3. 项目结构

```
apps/web/
├── tests/
│   ├── features/           # Feature 文件（Gherkin 语法）
│   │   ├── auth.feature
│   │   ├── chat.feature
│   │   └── search.feature
│   ├── steps/             # Step Definitions
│   │   ├── auth.steps.ts
│   │   ├── chat.steps.ts
│   │   └── common.steps.ts
│   ├── pages/             # Page Object Model
│   │   ├── LoginPage.ts
│   │   ├── ChatPage.ts
│   │   └── CommonPage.ts
│   ├── hooks/             # Before/After hooks
│   │   └── hooks.ts
│   └── support/           # 辅助工具
│       └── world.ts       # Custom World
├── cucumber.js            # Cucumber 配置
├── reports/               # 测试报告（自动生成）
│   ├── cucumber-report.html
│   ├── cucumber-report.json
│   ├── screenshots/
│   └── videos/
└── e2e/                   # 旧的 Playwright 测试（待迁移）
```

## 4. Feature 文件编写规范

### 4.1 基本结构

```gherkin
# language: zh-CN
功能: 功能名称
  作为一个 [角色]
  我想要 [功能]
  以便 [业务价值]

  背景:
    假设 [前置条件]

  场景: 场景名称
    假设 [前置条件]
    当 [执行操作]
    那么 [预期结果]
```

### 4.2 编写原则

1. **使用中文**: 所有 Feature 文件使用中文编写，提高可读性
2. **业务语言**: 使用业务术语，避免技术实现细节
3. **独立性**: 每个场景应该独立，不依赖其他场景
4. **可读性**: 场景应该像讲故事一样，非技术人员也能理解
5. **简洁性**: 每个场景聚焦一个核心功能点

### 4.3 Given-When-Then 模式

- **Given (假设)**: 设置测试的前置条件和初始状态
- **When (当)**: 执行用户操作或触发事件
- **Then (那么)**: 验证预期结果

### 4.4 数据驱动测试

使用 `场景大纲` (Scenario Outline) 和 `例子` (Examples) 实现参数化测试：

```gherkin
场景大纲: 访问多个受保护页面
  假设 我已经成功登录
  当 我访问受保护页面 "<页面路径>"
  那么 我应该看到页面内容

  例子:
    | 页面路径 |
    | /chat    |
    | /feed    |
    | /topics  |
```

## 5. Step Definitions 编写规范

### 5.1 基本原则

1. **原子化**: 每个步骤应该是原子操作，可复用
2. **无状态**: 步骤之间通过 World 对象传递状态，不使用全局变量
3. **委托模式**: 步骤定义不直接操作 DOM，委托给 Page Objects
4. **参数化**: 使用正则表达式捕获参数，提高复用性

### 5.2 命名规范

```typescript
// Given 步骤 - 使用现在时或完成时
Given('我访问应用首页', async function (this: CustomWorld) {})
Given('我已经成功登录', async function (this: CustomWorld) {})

// When 步骤 - 使用现在时
When('我输入密码 {string}', async function (this: CustomWorld, password: string) {})
When('我点击登录按钮', async function (this: CustomWorld) {})

// Then 步骤 - 使用"应该"表达预期
Then('我应该看到欢迎消息', async function (this: CustomWorld) {})
Then('页面应该重定向到 {string}', async function (this: CustomWorld, path: string) {})
```

### 5.3 参数类型

```typescript
// 字符串参数
When('我输入 {string}', async function (password: string) {})

// 数字参数
When('我等待 {int} 秒', async function (seconds: number) {})

// 浮点数参数
When('价格是 {float} 元', async function (price: number) {})
```

## 6. Page Object Model 规范

### 6.1 基本结构

```typescript
export class PageName {
  constructor(private page: Page) {}

  // 元素定位器 - 使用 getter
  get elementName() {
    return this.page.locator('selector')
  }

  // 页面操作 - 使用 async 方法
  async performAction() {
    // 实现
  }

  // 页面验证 - 返回布尔值或抛出异常
  async isInExpectedState() {
    return true
  }
}
```

### 6.2 编写原则

1. **封装性**: 所有页面元素和操作都封装在 Page Object 中
2. **单一职责**: 每个 Page Object 对应一个页面或组件
3. **可维护性**: 元素定位器集中管理，便于维护
4. **可测试性**: 提供清晰的 API，便于编写测试

### 6.3 元素定位优先级

1. **语义化选择器**: `role`, `label`, `text`
2. **测试 ID**: `data-testid`
3. **CSS 选择器**: `class`, `id`
4. **XPath**: 最后的选择

## 7. Hooks 使用规范

### 7.1 Hook 类型

```typescript
// 所有测试前执行一次
BeforeAll(async function () {})

// 每个场景前执行
Before(async function (this: CustomWorld) {})

// 每个场景后执行
After(async function (this: CustomWorld, { pickle, result }) {})

// 所有测试后执行一次
AfterAll(async function () {})
```

### 7.2 使用场景

- **BeforeAll**: 创建报告目录、初始化全局配置
- **Before**: 初始化浏览器、清理测试数据
- **After**: 截图（失败时）、清理资源、关闭浏览器
- **AfterAll**: 生成测试报告、清理临时文件

### 7.3 标签过滤

```typescript
// 只对特定标签的场景执行
Before({ tags: '@smoke' }, async function () {})

// 排除特定标签
Before({ tags: 'not @skip' }, async function () {})
```

## 8. 测试数据管理

### 8.1 测试环境配置

```typescript
// 通过环境变量配置
const baseURL = process.env.BASE_URL || 'http://localhost:3000'
const testPassword = process.env.TEST_PASSWORD || 'test123'
```

### 8.2 测试数据文件

```
tests/
└── fixtures/
    ├── users.json
    ├── messages.json
    └── config.json
```

### 8.3 动态数据生成

```typescript
// 使用 faker 或自定义工具生成测试数据
import { faker } from '@faker-js/faker'

const testUser = {
  username: faker.internet.userName(),
  email: faker.internet.email()
}
```

## 9. 测试执行

### 9.1 命令行执行

```bash
# 运行所有测试
pnpm test:cucumber

# 运行特定 feature
pnpm test:cucumber tests/features/auth.feature

# 运行特定标签
pnpm test:cucumber --tags "@smoke"

# 并发执行
pnpm test:cucumber --parallel 4

# 调试模式
HEADLESS=false pnpm test:cucumber
```

### 9.2 环境变量

```bash
# 基础 URL
BASE_URL=http://localhost:3000

# 无头模式
HEADLESS=true

# 慢动作模式（调试用）
SLOW_MO=100

# 录制视频
VIDEO=true
```

## 10. 测试报告

### 10.1 报告类型

- **HTML 报告**: `reports/cucumber-report.html`
- **JSON 报告**: `reports/cucumber-report.json`
- **控制台输出**: 实时进度显示

### 10.2 失败处理

- 自动截图保存到 `reports/screenshots/`
- 视频录制保存到 `reports/videos/`
- 错误堆栈信息包含在报告中

## 11. 最佳实践

### 11.1 测试设计

1. **测试金字塔**: 优先编写单元测试，E2E 测试聚焦关键路径
2. **独立性**: 每个测试应该独立，可以任意顺序执行
3. **幂等性**: 测试可以重复执行，结果一致
4. **快速反馈**: 优先运行快速测试，慢速测试标记为 `@slow`

### 11.2 代码质量

1. **DRY 原则**: 避免重复代码，提取公共步骤和 Page Objects
2. **清晰命名**: 使用描述性的名称，见名知意
3. **注释说明**: 复杂逻辑添加注释，说明原因
4. **类型安全**: 充分利用 TypeScript 的类型系统

### 11.3 维护性

1. **定期重构**: 及时重构测试代码，保持清晰
2. **版本控制**: 测试代码与业务代码一起版本控制
3. **文档更新**: 及时更新测试文档和规范
4. **代码审查**: 测试代码也需要代码审查

## 12. 常见问题

### 12.1 测试不稳定

- **原因**: 异步操作、网络延迟、元素未加载
- **解决**: 使用 `waitFor` 等待元素，增加合理的超时时间

### 12.2 测试速度慢

- **原因**: 串行执行、等待时间过长
- **解决**: 并发执行、优化等待策略、使用 API 准备数据

### 12.3 元素定位失败

- **原因**: 页面结构变化、选择器不稳定
- **解决**: 使用稳定的选择器、添加 `data-testid`

## 13. 附录

### 13.1 参考资源

- [Cucumber 官方文档](https://cucumber.io/docs/cucumber/)
- [Playwright 官方文档](https://playwright.dev/)
- [Gherkin 语法参考](https://cucumber.io/docs/gherkin/reference/)

### 13.2 示例项目

- [Playwright-Cucumber](https://github.com/ghoshasish99/Playwright-Cucumber)
- [cucumber-playwright-typescript](https://github.com/tallyb/cucumber-playwright-typescript)

---

**文档版本**: 1.0.0  
**最后更新**: 2026-05-02  
**维护者**: MoreChat 团队
