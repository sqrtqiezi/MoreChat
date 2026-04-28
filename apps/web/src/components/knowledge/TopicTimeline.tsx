// ABOUTME: 话题时间线容器，根据查询状态渲染列表或空状态
// ABOUTME: 统一 Topics 页面加载、错误和空结果的展示

import type { UseQueryResult } from '@tanstack/react-query'
import type { TopicSummary } from '../../types'
import { TopicCard } from './TopicCard'

interface TopicTimelineProps {
  topics: UseQueryResult<TopicSummary[], Error>
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <section className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-4 text-sm leading-6 text-stone-600 sm:text-base">{description}</p>
      </div>
    </section>
  )
}

export function TopicTimeline({ topics }: TopicTimelineProps) {
  const items = topics.data ?? []

  if (topics.isLoading) {
    return <EmptyPanel title="话题" description="正在加载话题时间线。" />
  }

  if (topics.error) {
    return <EmptyPanel title="加载失败" description="话题列表暂时不可用，请稍后重试。" />
  }

  if (items.length === 0) {
    return <EmptyPanel title="暂无话题" description="摘要与聚类产物会在这里汇总。" />
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Topics</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">话题</h2>
      </div>
      <div className="space-y-4 overflow-y-auto pb-6">
        {items.map((topic) => (
          <TopicCard key={topic.id} topic={topic} />
        ))}
      </div>
    </section>
  )
}
