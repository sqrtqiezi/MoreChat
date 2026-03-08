import fs from 'fs/promises'
import path from 'path'

interface MessageSample {
  filename: string
  data: any
  msgType: number
}

async function analyzeSamples() {
  const samplesDir = './samples'
  const files = await fs.readdir(samplesDir)
  const jsonFiles = files.filter(f => f.endsWith('.json'))

  console.log(`📊 Analyzing ${jsonFiles.length} message samples...\n`)

  const samples: MessageSample[] = []

  // 读取所有样本
  for (const file of jsonFiles) {
    const filepath = path.join(samplesDir, file)
    const content = await fs.readFile(filepath, 'utf-8')
    const data = JSON.parse(content)
    samples.push({ filename: file, data, msgType: data.msg_type })
  }

  // 按消息类型分组
  const byType = new Map<number, MessageSample[]>()
  for (const sample of samples) {
    const type = sample.msgType
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type)!.push(sample)
  }

  // 输出分析结果
  console.log('📋 Message Types Found:')
  console.log('─'.repeat(60))
  for (const [type, msgs] of byType.entries()) {
    const typeName = getMessageTypeName(type)
    console.log(`Type ${type} (${typeName}): ${msgs.length} samples`)
    console.log(`  Files: ${msgs.map(m => m.filename).join(', ')}`)
  }
  console.log('─'.repeat(60))

  // 分析字段
  console.log('\n📝 Common Fields:')
  const allFields = new Set<string>()
  for (const sample of samples) {
    Object.keys(sample.data).forEach(key => allFields.add(key))
  }
  console.log(Array.from(allFields).sort().join(', '))

  // 输出每种类型的示例
  console.log('\n📄 Sample Data by Type:\n')
  for (const [type, msgs] of byType.entries()) {
    console.log(`\n### Type ${type} - ${getMessageTypeName(type)}`)
    console.log('```json')
    console.log(JSON.stringify(msgs[0].data, null, 2))
    console.log('```')
  }
}

function getMessageTypeName(type: number): string {
  const types: Record<number, string> = {
    1: 'Text',
    3: 'Image',
    34: 'Voice',
    43: 'Video',
    47: 'Emoji',
    49: 'App/Link/File',
    10000: 'System',
  }
  return types[type] || 'Unknown'
}

analyzeSamples().catch(console.error)
