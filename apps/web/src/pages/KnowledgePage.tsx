import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { SearchBar } from '../components/knowledge/SearchBar'
import { SearchResultsPane } from '../components/knowledge/SearchResultsPane'
import { useSearch } from '../hooks/useSearch'
import { useKnowledgeStore } from '../stores/knowledgeStore'

export function KnowledgePage() {
  const search = useSearch()
  const query = useKnowledgeStore((state) => state.query)
  const mode = useKnowledgeStore((state) => state.mode)
  const filters = useKnowledgeStore((state) => state.filters)
  const setQuery = useKnowledgeStore((state) => state.setQuery)
  const setMode = useKnowledgeStore((state) => state.setMode)
  const setFilters = useKnowledgeStore((state) => state.setFilters)

  return (
    <KnowledgeLayout>
      <SearchBar
        query={query}
        mode={mode}
        importantOnly={Boolean(filters.important)}
        onSubmit={setQuery}
        onModeChange={setMode}
        onImportantChange={(important) => setFilters({ important })}
      />
      <div className="flex min-h-0 flex-1">
        <SearchResultsPane search={search} />
      </div>
    </KnowledgeLayout>
  )
}
