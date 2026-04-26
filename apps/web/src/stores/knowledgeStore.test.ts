import { describe, expect, it } from 'vitest'
import { useKnowledgeStore } from './knowledgeStore'

describe('knowledgeStore', () => {
  it('stores query, mode and filters', () => {
    useKnowledgeStore.setState({
      query: '',
      mode: 'keyword',
      filters: {},
      selectedResultId: null,
    })

    useKnowledgeStore.getState().setQuery('预算')
    useKnowledgeStore.getState().setMode('hybrid')
    useKnowledgeStore.getState().setFilters({ important: true })

    expect(useKnowledgeStore.getState().query).toBe('预算')
    expect(useKnowledgeStore.getState().mode).toBe('hybrid')
    expect(useKnowledgeStore.getState().filters.important).toBe(true)
  })
})
