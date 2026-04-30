// ABOUTME: 聊天搜索结果面板，显示搜索结果列表
// ABOUTME: 点击结果卡片更新 URL 参数以显示消息详情
import { useSearchParams } from 'react-router-dom'
import { useChatSearch } from '../../hooks/useChatSearch'
import type { SearchResponse, SearchResultItem } from '../../types'

interface ChatSearchResultsPaneProps {
  query: string
}

function formatCreateTime(createTime: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createTime * 1000))
}

function SearchResultCard({ result, isSelected, onSelect }: {
  result: SearchResultItem
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`选择搜索结果：${result.content}`}
      aria-pressed={isSelected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect()
      }}
      className={`rounded-2xl border p-4 text-left transition cursor-pointer ${
        isSelected
          ? 'border-blue-400 bg-blue-50/80 shadow-sm'
          : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
      }`}
    >
      <div className="flex flex-col gap-3">
        <p className="line-clamp-3 text-sm leading-6 text-slate-900">{result.content}</p>
        <div className="flex items-center gap-4 text-xs text-stone-600">
          <div>
            <span className="text-stone-400">发送人：</span>
            <span className="text-stone-700">{result.fromUsername}</span>
          </div>
          <div>
            <span className="text-stone-400">时间：</span>
            <span className="text-stone-700">{formatCreateTime(result.createTime)}</span>
          </div>
        </div>
      </div>
    </article>
  )
}

export function ChatSearchResultsPane({ query }: ChatSearchResultsPaneProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedMsgId = searchParams.get('msgId')
  const { data: rawData, isLoading, error } = useChatSearch(query)
  const data = rawData as SearchResponse | undefined

  const handleSelectResult = (result: SearchResultItem) => {
    if (!result.conversationId) return
    setSearchParams({
      q: query,
      msgId: result.msgId,
      conversationId: result.conversationId,
    })
  }

  return (
    <div className="w-[400px] border-r border-stone-200 bg-stone-50 flex flex-col">
      <div className="p-4 border-b border-stone-200 bg-white">
        <h2 className="text-lg font-semibold text-stone-900">搜索结果</h2>
        {data && (
          <p className="text-sm text-stone-600 mt-1">
            找到 {data.total} 条结果
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-stone-600">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm">搜索中...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <p className="text-sm text-red-600 text-center">搜索失败</p>
            <p className="text-xs text-stone-500 mt-2 text-center">
              {error instanceof Error ? error.message : '未知错误'}
            </p>
          </div>
        )}

        {data && data.results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <svg className="w-16 h-16 text-stone-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm text-stone-600 text-center">未找到相关消息</p>
            <p className="text-xs text-stone-500 mt-2 text-center">
              尝试使用不同的关键词
            </p>
          </div>
        )}

        {data && data.results.length > 0 && (
          <div className="space-y-3">
            {data.results.map((result) => (
              <SearchResultCard
                key={result.msgId}
                result={result}
                isSelected={selectedMsgId === result.msgId}
                onSelect={() => handleSelectResult(result)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
