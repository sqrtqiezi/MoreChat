// ABOUTME: 重要消息列表容器，处理加载、错误、空状态与成功态渲染
// ABOUTME: 将 highlights 查询结果映射为可滚动的卡片列表

import type { UseQueryResult } from '@tanstack/react-query'
import type { HighlightsResponse } from '../../types'
import { HighlightCard } from './HighlightCard'

interface HighlightsListProps {
  highlights: UseQueryResult<HighlightsResponse, Error>
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

export function HighlightsList({ highlights }: HighlightsListProps) {
  const items = highlights.data?.items ?? []

  if (highlights.isLoading) {
    return <EmptyPanel title="重要消息" description="正在加载重要消息流。" />
  }

  if (highlights.error) {
    return <EmptyPanel title="加载失败" description="重要消息暂时不可用，请稍后重试。" />
  }

  if (items.length === 0) {
    return <EmptyPanel title="暂无重要消息" description="当规则或摘要命中后，这里会显示重要消息流。" />
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Feed</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">重要消息</h2>
        </div>
        <p className="text-sm text-stone-500">{highlights.data?.total ?? items.length} 条消息</p>
      </div>
      <div className="space-y-4 overflow-y-auto pb-6">
        {items.map((item) => (
          <HighlightCard key={item.msgId} item={item} />
        ))}
      </div>
    </section>
  )
}
