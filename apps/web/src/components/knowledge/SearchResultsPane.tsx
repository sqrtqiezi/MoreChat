import type { UseQueryResult } from '@tanstack/react-query'
import { useKnowledgeStore } from '../../stores/knowledgeStore'
import { knowledgeApi } from '../../api/knowledge'
import { SearchResultCard } from './SearchResultCard'

type SearchResponse = Awaited<ReturnType<typeof knowledgeApi.search>>

interface SearchResultsPaneProps {
  search: UseQueryResult<SearchResponse, Error>
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="rounded-3xl border border-stone-200 bg-white p-5"
        >
          <div className="h-4 w-3/4 animate-pulse rounded bg-stone-200" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-stone-100" />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="h-10 animate-pulse rounded bg-stone-100" />
            <div className="h-10 animate-pulse rounded bg-stone-100" />
            <div className="h-10 animate-pulse rounded bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyPanel({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_45%),linear-gradient(135deg,_#ffffff,_#f5f5f4)] p-8 shadow-sm sm:p-10">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
          {description}
        </p>
      </div>
    </section>
  )
}

export function SearchResultsPane({ search }: SearchResultsPaneProps) {
  const query = useKnowledgeStore((state) => state.query)
  const trimmedQuery = query.trim()
  const results = search.data?.results ?? []
  const downgradeMessage = (() => {
    if (!search.data?.downgradedFrom) {
      return null
    }

    const modeLabel = search.data.downgradedFrom === 'semantic' ? '语义' : '混合'
    return `${modeLabel}搜索当前不可用，已回退到关键词搜索。`
  })()

  if (!trimmedQuery) {
    return (
      <EmptyPanel
        eyebrow="Search"
        title="搜索微信历史消息"
        description="先输入关键词，或者切换到语义与混合模式。结果区、专题区和会话联动会在后续任务接上。"
      />
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Results</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {trimmedQuery}
          </h2>
        </div>
        {search.data ? (
          <p className="text-sm text-stone-500">{search.data.total} 条结果</p>
        ) : null}
      </div>

      {downgradeMessage ? (
        <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {downgradeMessage}
        </p>
      ) : null}

      {search.isLoading ? <ResultsSkeleton /> : null}

      {!search.isLoading && search.error ? (
        <EmptyPanel
          eyebrow="Search Error"
          title="搜索失败"
          description="知识库搜索暂时不可用，请稍后重试。"
        />
      ) : null}

      {!search.isLoading && !search.error && results.length === 0 ? (
        <EmptyPanel
          eyebrow="No Results"
          title="未找到结果"
          description="换一个关键词，或者切换搜索模式后重试。"
        />
      ) : null}

      {!search.isLoading && !search.error && results.length > 0 ? (
        <div className="space-y-4 overflow-y-auto pb-6">
          {results.map((result) => (
            <SearchResultCard key={result.msgId} result={result} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
