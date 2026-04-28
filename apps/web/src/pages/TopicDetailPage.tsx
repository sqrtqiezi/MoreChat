import { useParams } from 'react-router-dom'
import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { TopicMessageList } from '../components/knowledge/TopicMessageList'
import { useTopicMessages } from '../hooks/useTopicMessages'

export function TopicDetailPage() {
  const { topicId = '' } = useParams()
  const topicDetail = useTopicMessages(topicId)

  if (topicDetail.isLoading) {
    return (
      <KnowledgeLayout>
        <section className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">正在加载话题</h2>
          </div>
        </section>
      </KnowledgeLayout>
    )
  }

  if (topicDetail.error || !topicDetail.data) {
    return (
      <KnowledgeLayout>
        <section className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-3xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">话题加载失败</h2>
            <p className="mt-4 text-sm leading-6 text-stone-600">请稍后重试。</p>
          </div>
        </section>
      </KnowledgeLayout>
    )
  }

  const { topic, messages } = topicDetail.data

  return (
    <KnowledgeLayout>
      <section className="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Topic Detail</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{topic.title}</h2>
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
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">状态</dt>
              <dd className="mt-1 text-stone-700">{topic.status}</dd>
            </div>
          </dl>
        </div>
        <div className="mt-5">
          <TopicMessageList messages={messages} />
        </div>
      </section>
    </KnowledgeLayout>
  )
}
