// Cucumber 配置文件
module.exports = {
  default: {
    // 指定 feature 文件路径
    paths: ['tests/features/**/*.feature'],

    // 使用 import 而不是 require（支持 ES modules）
    import: ['tests/steps/**/*.ts', 'tests/hooks/**/*.ts', 'tests/support/**/*.ts'],

    // 输出格式
    format: [
      'progress-bar',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json',
      '@cucumber/pretty-formatter'
    ],

    // 并发执行
    parallel: 1,

    // 失败时立即退出
    failFast: false,

    // 严格模式：未定义的步骤会导致失败
    strict: true,

    // 发布安静模式的结果
    publishQuiet: true
  }
}
