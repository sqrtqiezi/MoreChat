// ABOUTME: DuckDB 服务，提供连接管理、FTS schema 初始化和全文搜索功能
// ABOUTME: 支持中文分词后的 token 存储和 LIKE 查询

import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api'
import { logger } from '../lib/logger.js'

export interface DuckDBConfig {
  dbPath: string
}

export interface FTSRecord {
  msgId: string
  contentTokens: string
  createTime: number
  fromUsername: string
  toUsername: string
}

export interface FTSSearchResult {
  msgId: string
  contentTokens: string
  createTime: number
  fromUsername: string
  toUsername: string
}

export class DuckDBService {
  private instance: DuckDBInstance | null = null
  private connection: DuckDBConnection | null = null
  private readonly config: DuckDBConfig

  constructor(config: DuckDBConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    try {
      logger.info(`初始化 DuckDB 实例: ${this.config.dbPath}`)
      this.instance = await DuckDBInstance.create(this.config.dbPath)
      this.connection = await this.instance.connect()

      await this.createSchema()
      logger.info('DuckDB 服务初始化完成')
    } catch (error) {
      logger.error('DuckDB 初始化失败', error)
      throw error
    }
  }

  private async createSchema(): Promise<void> {
    await this.connection!.run(`
      CREATE TABLE IF NOT EXISTS message_fts (
        msg_id VARCHAR PRIMARY KEY,
        content_tokens VARCHAR,
        create_time BIGINT,
        from_username VARCHAR,
        to_username VARCHAR
      )
    `)
  }

  async insertFTS(record: FTSRecord): Promise<void> {
    await this.connection!.run(
      `INSERT INTO message_fts (msg_id, content_tokens, create_time, from_username, to_username)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (msg_id) DO NOTHING`,
      [
        record.msgId,
        record.contentTokens,
        BigInt(record.createTime),
        record.fromUsername,
        record.toUsername,
      ]
    )
  }

  async searchFTS(keyword: string): Promise<FTSSearchResult[]> {
    const reader = await this.connection!.runAndReadAll(
      `SELECT msg_id, content_tokens, create_time, from_username, to_username
       FROM message_fts
       WHERE content_tokens LIKE $1`,
      [`%${keyword}%`]
    )

    return this.readerToFTSResults(reader)
  }

  async query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    const reader = await this.connection!.runAndReadAll(sql, params as never)
    const rows = reader.getRowObjectsJS()
    return rows as Record<string, unknown>[]
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.closeSync()
      this.connection = null
    }
    if (this.instance) {
      this.instance.closeSync()
      this.instance = null
    }
    logger.info('DuckDB 连接已关闭')
  }

  private readerToFTSResults(reader: import('@duckdb/node-api').DuckDBResultReader): FTSSearchResult[] {
    const rows = reader.getRowObjectsJS()
    return rows.map((row) => ({
      msgId: String(row.msg_id),
      contentTokens: String(row.content_tokens),
      createTime: Number(row.create_time),
      fromUsername: String(row.from_username),
      toUsername: String(row.to_username),
    }))
  }
}
