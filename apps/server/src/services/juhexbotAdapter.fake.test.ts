import { describe, expect, it } from 'vitest'
import { JuhexbotAdapterFake } from './juhexbotAdapter.fake.js'

const SEEDED_E2E_SELF_USERNAME = 'wxid_e2e_messaging_user'

describe('JuhexbotAdapterFake', () => {
  it('uses the seeded messaging self username by default', async () => {
    const adapter = new JuhexbotAdapterFake({
      apiUrl: 'http://localhost/fake-api',
      appKey: 'test_key',
      appSecret: 'test_secret',
      clientGuid: 'test-guid-123',
      cloudApiUrl: 'http://localhost/fake-cloud'
    })

    const profile = await adapter.getProfile()
    const chatroomMembers = await adapter.getChatroomMemberDetail('room@chatroom')
    const cdnInfo = await adapter.getCdnInfo()

    expect(profile.username).toBe(SEEDED_E2E_SELF_USERNAME)
    expect(adapter.getCurrentUsername()).toBe(SEEDED_E2E_SELF_USERNAME)
    expect(chatroomMembers.members[0]?.username).toBe(SEEDED_E2E_SELF_USERNAME)
    expect(cdnInfo.username).toBe(SEEDED_E2E_SELF_USERNAME)
  })
})
