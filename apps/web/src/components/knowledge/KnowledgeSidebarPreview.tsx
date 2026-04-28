// ABOUTME: 在知识库侧边栏展示重要消息计数与最近专题预览。
// ABOUTME: 通过 highlights 与 topics-preview 查询渲染快速入口。
import { Link } from 'react-router-dom'
import { useHighlights } from '../../hooks/useHighlights'
import { useTopicsPreview } from '../../hooks/useTopicsPreview'

export function KnowledgeSidebarPreview() {
  const topics = useTopicsPreview()
  const highlights = useHighlights(1, 0)

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-3xl border border-stone-800 bg-stone-900/60 p-4 text-sm text-stone-400">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Preview</p>
        <p className="mt-2 text-stone-200">重要消息 {highlights.data?.total ?? 0} 条</p>
      </div>
      <div className="rounded-3xl border border-stone-800 bg-stone-900/60 p-4 text-sm text-stone-400">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Recent Topics</p>
        <div className="mt-3 space-y-2">
          {(topics.data ?? []).map((topic) => (
            <Link
              key={topic.id}
              to={`/topics/${topic.id}`}
              className="block rounded-2xl border border-stone-800 px-3 py-2 text-stone-200 transition hover:border-stone-700 hover:bg-stone-900"
            >
              {topic.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
