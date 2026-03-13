import type { DatabaseService } from './database.js'

export class DirectoryService {
  constructor(private db: DatabaseService) {}

  async list(clientGuid: string) {
    const client = await this.db.findClientByGuid(clientGuid)
    if (!client) {
      throw new Error('Client not found')
    }

    const [contacts, groups] = await Promise.all([
      this.db.getDirectoryContacts(client.id),
      this.db.getDirectoryGroups(client.id),
    ])

    return { contacts, groups }
  }
}
