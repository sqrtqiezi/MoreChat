import { KnowledgeEmptyState } from '../components/knowledge/KnowledgeEmptyState'
import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { SearchBar } from '../components/knowledge/SearchBar'
import { useKnowledgeStore } from '../stores/knowledgeStore'

export function KnowledgePage() {
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
      <KnowledgeEmptyState />
    </KnowledgeLayout>
  )
}
