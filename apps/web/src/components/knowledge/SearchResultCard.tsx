import { useNavigate } from 'react-router-dom'
import { useKnowledgeStore } from '../../stores/knowledgeStore'
import type { SearchResultItem } from '../../types'

interface SearchResultCardProps {
  result: SearchResultItem
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

export function SearchResultCard({ result }: SearchResultCardProps) {
  const navigate = useNavigate()
  const selectedResultId = useKnowledgeStore((state) => state.selectedResultId)
  const selectResult = useKnowledgeStore((state) => state.selectResult)
  const isSelected = selectedResultId === result.msgId

  return (
    <article
      onClick={() => selectResult(result.msgId)}
      className={`rounded-3xl border p-5 text-left transition ${
        isSelected
          ? 'border-amber-300 bg-amber-50/80 shadow-sm'
          : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-4 text-sm leading-6 text-slate-900">{result.content}</p>
        </div>
        <button
          type="button"
          disabled={!result.conversationId}
          onClick={(event) => {
            event.stopPropagation()
            if (!result.conversationId) return
            navigate(`/chat?conversationId=${result.conversationId}`)
          }}
          className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          打开原始对话
        </button>
      </div>

      <dl className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">发送人</dt>
          <dd className="mt-1 text-stone-700">{result.fromUsername}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">时间</dt>
          <dd className="mt-1 text-stone-700">{formatCreateTime(result.createTime)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">对话</dt>
          <dd className="mt-1 break-all text-stone-700">
            {result.conversationId ?? '未关联对话'}
          </dd>
        </div>
      </dl>
    </article>
  )
}
