// ABOUTME: 验证嵌入模型文件是否完整存在
// ABOUTME: 检查 config.json、tokenizer.json 和 onnx/model.onnx 文件

import { existsSync } from 'fs'
import { join } from 'path'
import { logger } from '../src/lib/logger.js'

const MODEL_DIR = join(process.cwd(), '../../deploy-package/models/bge-small-zh-v1.5')

const REQUIRED_FILES = [
  'config.json',
  'tokenizer.json',
  'onnx/model.onnx'
]

async function main(): Promise<void> {
  logger.info({ modelDir: MODEL_DIR }, '开始验证嵌入模型文件')

  const missingFiles: string[] = []

  for (const file of REQUIRED_FILES) {
    const filePath = join(MODEL_DIR, file)
    if (!existsSync(filePath)) {
      missingFiles.push(file)
      logger.error({ file: filePath }, '模型文件缺失')
    } else {
      logger.info({ file: filePath }, '模型文件存在')
    }
  }

  if (missingFiles.length > 0) {
    logger.error(
      { missingFiles, modelDir: MODEL_DIR },
      '嵌入模型验证失败：缺少必需文件'
    )
    process.exit(1)
  }

  logger.info('嵌入模型验证成功：所有必需文件均存在')
}

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error))
  logger.error({ err }, '验证脚本执行失败')
  process.exit(1)
})
