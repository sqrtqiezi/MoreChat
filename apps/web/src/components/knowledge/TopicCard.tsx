// ABOUTME: 话题时间线卡片，展示话题摘要和统计信息
// ABOUTME: 为 Topics 页面提供进入详情页的稳定交互

import { useNavigate } from 'react-router-dom'
import type { TopicSummary } from '../../types'

interface TopicCardProps {
  topic: TopicSummary
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

export function TopicCard({ topic }: TopicCardProps) {
  const navigate = useNavigate()

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`打开话题：${topic.title}`}
      onClick={() => navigate(`/topics/${topic.id}`)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        navigate(`/topics/${topic.id}`)
      }}
      className="rounded-3xl border border-stone-200 bg-white p-5 text-left transition hover:border-stone-300 hover:shadow-sm"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Topic</p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{topic.title}</h3>
      <p className="mt-3 text-sm leading-6 text-stone-700">{topic.summary}</p>
      <dl className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">消息数</dt>
          <dd className="mt-1 text-stone-700">{topic.messageCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">参与人数</dt>
          <dd className="mt-1 text-stone-700">{topic.participantCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">最后活跃</dt>
          <dd className="mt-1 text-stone-700">{formatCreateTime(topic.lastSeenAt)}</dd>
        </div>
      </dl>
    </article>
  )
}
