// ABOUTME: Tokenizes Chinese text using nodejieba for FTS indexing
// ABOUTME: Provides word segmentation and space-joined token output

import nodejieba from 'nodejieba'

export class Tokenizer {
  constructor() {
    // nodejieba 会自动加载默认词典
  }

  /**
   * 对文本进行中文分词
   * @param text 待分词的文本
   * @returns 分词结果数组
   */
  tokenize(text: string): string[] {
    if (!text || text.trim() === '') {
      return []
    }

    return nodejieba.cut(text)
  }

  /**
   * 对文本进行分词并用空格连接
   * @param text 待分词的文本
   * @returns 空格分隔的分词结果
   */
  tokenizeAndJoin(text: string): string {
    const tokens = this.tokenize(text)
    return tokens.join(' ')
  }
}
