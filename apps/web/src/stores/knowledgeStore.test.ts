import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { knowledgeApi } from '../api/knowledge'
import { useSearch } from '../hooks/useSearch'
import { useTopics } from '../hooks/useTopics'
import { useKnowledgeStore } from './knowledgeStore'

const useQueryMock = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}))

vi.mock('../api/knowledge', () => ({
  knowledgeApi: {
    search: vi.fn(),
    listTopics: vi.fn(),
  },
}))

describe('knowledgeStore', () => {
  beforeEach(() => {
    useQueryMock.mockReset()
    vi.mocked(knowledgeApi.search).mockReset()
    vi.mocked(knowledgeApi.listTopics).mockReset()
    useKnowledgeStore.getState().reset()
  })

  it('defaults to keyword mode', () => {
    expect(useKnowledgeStore.getState().mode).toBe('keyword')
  })

  it('shallow merges filters instead of replacing unspecified fields', () => {
    useKnowledgeStore.getState().setFilters({ from: 'alice', important: true })
    useKnowledgeStore.getState().setFilters({ group: 'team-room' })

    expect(useKnowledgeStore.getState().filters).toEqual({
      from: 'alice',
      group: 'team-room',
      important: true,
    })
  })

  it('stores selected result ids', () => {
    useKnowledgeStore.getState().selectResult('msg-123')
    expect(useKnowledgeStore.getState().selectedResultId).toBe('msg-123')

    useKnowledgeStore.getState().selectResult(null)
    expect(useKnowledgeStore.getState().selectedResultId).toBeNull()
  })

  it('resets query, mode, filters, and selected result id', () => {
    useKnowledgeStore.getState().setQuery('budget')
    useKnowledgeStore.getState().setMode('semantic')
    useKnowledgeStore.getState().setFilters({ from: 'alice', important: true })
    useKnowledgeStore.getState().selectResult('msg-123')

    useKnowledgeStore.getState().reset()

    expect(useKnowledgeStore.getState()).toMatchObject({
      query: '',
      mode: 'keyword',
      filters: {},
      selectedResultId: null,
    })
  })
})

describe('useSearch', () => {
  beforeEach(() => {
    useQueryMock.mockImplementation(({ queryFn, ...options }: { queryFn: () => unknown }) => {
      void queryFn
      return {
        data: undefined,
        error: null,
        isLoading: false,
        ...options,
      }
    })
  })

  it('uses the expected query key and disables searching for blank queries', () => {
    useKnowledgeStore.setState({
      query: '   ',
      mode: 'hybrid',
      filters: { from: 'alice', important: true },
      selectedResultId: null,
    })

    const { result } = renderHook(() => useSearch())

    expect(useQueryMock).toHaveBeenCalled()
    expect(useQueryMock.mock.lastCall?.[0]).toMatchObject({
      queryKey: ['knowledge-search', '   ', 'hybrid', { from: 'alice', important: true }],
      enabled: false,
    })
    expect(result.current.enabled).toBe(false)
  })

  it('enables non-blank queries and passes normalized search params to knowledgeApi.search', async () => {
    vi.mocked(knowledgeApi.search).mockResolvedValue({
      results: [],
      total: 0,
      query: 'budget',
    })

    useKnowledgeStore.setState({
      query: 'budget',
      mode: 'semantic',
      filters: { from: 'alice', before: 20, important: true },
      selectedResultId: null,
    })

    renderHook(() => useSearch())

    const useQueryArgs = useQueryMock.mock.lastCall?.[0]

    expect(useQueryArgs).toMatchObject({
      queryKey: ['knowledge-search', 'budget', 'semantic', { from: 'alice', before: 20, important: true }],
      enabled: true,
    })

    await useQueryArgs.queryFn()

    expect(knowledgeApi.search).toHaveBeenCalledWith({
      q: 'budget',
      type: 'semantic',
      from: 'alice',
      before: 20,
      important: true,
      limit: 30,
      offset: 0,
    })
  })
})

describe('useTopics', () => {
  beforeEach(() => {
    useQueryMock.mockImplementation(({ queryFn, ...options }: { queryFn: () => Promise<unknown> }) => ({
      data: undefined,
      error: null,
      isLoading: false,
      ...options,
    }))
  })

  it('uses the knowledge-topics query key and loads topics from the api', async () => {
    vi.mocked(knowledgeApi.listTopics).mockResolvedValue([
      {
        id: 'topic-1',
        title: 'Topic 1',
        summary: 'Summary',
        messageCount: 3,
        participantCount: 2,
        lastSeenAt: 123,
        status: 'active',
      },
    ])

    renderHook(() => useTopics())

    expect(useQueryMock).toHaveBeenCalled()
    expect(useQueryMock.mock.lastCall?.[0]).toMatchObject({
      queryKey: ['knowledge-topics'],
      staleTime: 60_000,
    })

    await useQueryMock.mock.lastCall?.[0].queryFn()

    expect(knowledgeApi.listTopics).toHaveBeenCalledTimes(1)
    expect(knowledgeApi.listTopics).toHaveBeenCalledWith()
  })
})
