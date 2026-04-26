import { describe, it } from 'vitest'

describe('knowledgeStore', () => {
  it('requires the knowledge store module to exist', async () => {
    const modulePath = './knowledgeStore'
    await import(/* @vite-ignore */ modulePath)
  })
})
