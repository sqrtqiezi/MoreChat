// ABOUTME: 重要消息卡片，优先展示知识卡片或摘要，再展示锚点消息
// ABOUTME: 为 Feed 页面提供跳转原始对话的稳定交互

import { useNavigate } from 'react-router-dom'
import type { HighlightItem } from '../../types'

interface HighlightCardProps {
  item: HighlightItem
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

export function HighlightCard({ item }: HighlightCardProps) {
  const navigate = useNavigate()
  const title = item.knowledgeCard?.title ?? '重要消息'
  const summary = item.knowledgeCard?.summary ?? item.digest?.summary ?? item.content

  return (
    <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Highlight</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-stone-700">{summary}</p>
          <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <p className="line-clamp-3 text-sm leading-6 text-slate-900">{item.content}</p>
            <dl className="mt-3 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">发送人</dt>
                <dd className="mt-1 text-stone-700">{item.fromUsername}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">时间</dt>
                <dd className="mt-1 text-stone-700">{formatCreateTime(item.createTime)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">来源</dt>
                <dd className="mt-1 text-stone-700">{item.tags.map((tag) => tag.source).join(' / ')}</dd>
              </div>
            </dl>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/chat?conversationId=${item.conversationId}`)}
          className="shrink-0 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
        >
          打开原始对话
        </button>
      </div>
    </article>
  )
}
