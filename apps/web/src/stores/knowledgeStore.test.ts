import { describe, expect, it } from 'vitest'
import { useKnowledgeStore } from './knowledgeStore'

describe('knowledgeStore', () => {
  it('exposes the knowledge store hook', () => {
    expect(typeof useKnowledgeStore).toBe('function')
  })
})
