import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const OPTIONS_WITH_VALUES = new Set([
  '-c',
  '--config',
  '-f',
  '--format',
  '--format-options',
  '--i18n-keywords',
  '-i',
  '--import',
  '-l',
  '--loader',
  '--language',
  '-n',
  '--name',
  '--order',
  '--parallel',
  '--plugin',
  '--plugin-options',
  '-p',
  '--profile',
  '-r',
  '--require',
  '--require-module',
  '--retry',
  '--retry-tag-filter',
  '--shard',
  '-t',
  '--tags',
  '--world-parameters'
])

function hasPositionalFeaturePath(args) {
  let consumeNextValue = false

  for (const arg of args) {
    if (consumeNextValue) {
      consumeNextValue = false
      continue
    }

    if (arg.startsWith('--') && arg.includes('=')) {
      continue
    }

    if (OPTIONS_WITH_VALUES.has(arg)) {
      consumeNextValue = true
      continue
    }

    if (arg.startsWith('-')) {
      continue
    }

    return true
  }

  return false
}

const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--')
const packageRoot = path.dirname(
  createRequire(import.meta.url).resolve('@cucumber/cucumber/package.json')
)
const cucumberBin = path.join(packageRoot, 'bin', 'cucumber.js')
const args = ['--config', 'cucumber.cjs', ...cliArgs]
const hasExplicitPaths = hasPositionalFeaturePath(cliArgs)
const env = {
  ...process.env,
  ...(hasExplicitPaths ? { CUCUMBER_DISABLE_DEFAULT_PATHS: '1' } : {})
}

if (process.env.DEBUG_CUCUMBER_RUNNER === '1') {
  console.log(
    `[run-cucumber] ${JSON.stringify({
      disableDefaultPaths: hasExplicitPaths,
      args
    })}`
  )
}

const child = spawn(process.execPath, [cucumberBin, ...args], {
  cwd: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
  env,
  stdio: 'inherit'
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
