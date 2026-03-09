import type { JuhexbotAdapter } from './juhexbotAdapter.js'

export class ClientService {
  constructor(private adapter: JuhexbotAdapter) {}

  async getStatus(): Promise<{ online: boolean; guid: string }> {
    return this.adapter.getClientStatus()
  }
}
