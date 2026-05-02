// ABOUTME: Cucumber hooks - 在测试前后执行的操作
// ABOUTME: Before: 初始化浏览器，After: 截图（失败时）+ 清理资源

import { Before, After, Status, BeforeAll, AfterAll } from '@cucumber/cucumber'
import { CustomWorld } from '../support/world'
import * as fs from 'fs'
import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'

// 获取当前文件的目录路径（ES modules）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 全局变量存储服务器进程
let serverProcess: ChildProcess | null = null
let webProcess: ChildProcess | null = null

// 等待服务器启动
async function waitForServer(url: string, timeout = 120000): Promise<boolean> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return true
      }
    } catch (error) {
      // 服务器还未启动，继续等待
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

// 检查端口是否被占用
async function isPortInUse(port: number): Promise<boolean> {
  try {
    const { exec } = await import('child_process')
    return new Promise((resolve) => {
      exec(`lsof -ti:${port}`, (error, stdout) => {
        resolve(!!stdout.trim())
      })
    })
  } catch {
    return false
  }
}

// 确保报告目录存在并启动服务器
BeforeAll({ timeout: 180000 }, async function () {
  // 创建报告目录
  const dirs = ['reports', 'reports/screenshots', 'reports/videos']
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })

  // 检查服务器是否已经在运行
  const serverRunning = await isPortInUse(3100)
  const webRunning = await isPortInUse(3000)

  if (serverRunning && webRunning) {
    console.log('✅ Servers already running')
    return
  }

  console.log('🚀 Starting local servers...')

  // 启动后端服务器
  if (!serverRunning) {
    serverProcess = spawn('pnpm', ['dev'], {
      cwd: path.resolve(__dirname, '../../../server'),
      stdio: 'pipe',
      shell: true
    })

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      if (output.includes('Server started') || output.includes('started on')) {
        console.log('✅ Backend server started')
      }
    })

    serverProcess.stderr?.on('data', (data) => {
      const error = data.toString()
      if (!error.includes('TimeoutOverflowWarning')) {
        console.error('Backend error:', error)
      }
    })

    // 等待后端服务器启动
    console.log('⏳ Waiting for backend server...')
    const serverReady = await waitForServer('http://localhost:3100/health')
    if (!serverReady) {
      throw new Error('Backend server failed to start')
    }
    console.log('✅ Backend server ready')
  }

  // 启动前端服务器
  if (!webRunning) {
    webProcess = spawn('pnpm', ['dev'], {
      cwd: path.resolve(__dirname, '../../'),
      stdio: 'pipe',
      shell: true
    })

    webProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      if (output.includes('Local:') || output.includes('localhost:3000')) {
        console.log('✅ Frontend server started')
      }
    })

    webProcess.stderr?.on('data', (data) => {
      console.error('Frontend error:', data.toString())
    })

    // 等待前端服务器启动
    console.log('⏳ Waiting for frontend server...')
    const webReady = await waitForServer('http://localhost:3000')
    if (!webReady) {
      throw new Error('Frontend server failed to start')
    }
    console.log('✅ Frontend server ready')
  }

  console.log('✅ All servers ready, starting tests...')
})

// 每个场景前：初始化浏览器
Before(async function (this: CustomWorld) {
  await this.init()
})

// 每个场景后：截图（失败时）+ 清理资源
After(async function (this: CustomWorld, { pickle, result }) {
  // 如果测试失败，截图
  if (result?.status === Status.FAILED && this.page) {
    const screenshotPath = path.join(
      'reports/screenshots',
      `${pickle.name.replace(/\s+/g, '_')}_${Date.now()}.png`
    )
    await this.page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`📸 Screenshot saved: ${screenshotPath}`)
  }

  // 清理资源
  await this.cleanup()
})

// 所有测试完成后的清理
AfterAll(async function () {
  console.log('✅ All tests completed')

  // 关闭服务器进程
  if (serverProcess) {
    console.log('🛑 Stopping backend server...')
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }

  if (webProcess) {
    console.log('🛑 Stopping frontend server...')
    webProcess.kill('SIGTERM')
    webProcess = null
  }
})
