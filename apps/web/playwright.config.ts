import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.spec.ts',
  fullyParallel: false, // 顺序执行，避免测试间干扰
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // 单线程执行
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // 注意：需要手动启动本地服务
  // 1. 终端1: cd apps/server && pnpm dev
  // 2. 终端2: cd apps/web && pnpm dev
  // 3. 终端3: cd apps/web && pnpm test:e2e
  //
  // 或者使用 webServer 配置自动启动（需要解决 onnxruntime 依赖问题）
  // webServer: [
  //   {
  //     command: 'cd ../server && pnpm dev',
  //     url: 'http://localhost:3100/health',
  //     timeout: 120000,
  //     reuseExistingServer: !process.env.CI,
  //   },
  //   {
  //     command: 'pnpm dev',
  //     url: 'http://localhost:3000',
  //     timeout: 120000,
  //     reuseExistingServer: !process.env.CI,
  //   },
  // ],
})
