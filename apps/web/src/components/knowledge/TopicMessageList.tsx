// ABOUTME: 话题详情消息列表，展示 topic 关联的 messageIndex 结果
// ABOUTME: 保持知识库卡片风格，不嵌入完整聊天窗口

import { useNavigate } from 'react-router-dom'
import type { SearchResultItem } from '../../types'

interface TopicMessageListProps {
  messages: SearchResultItem[]
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

export function TopicMessageList({ messages }: TopicMessageListProps) {
  const navigate = useNavigate()

  if (messages.length === 0) {
    return <p className="rounded-3xl border border-stone-200 bg-white p-5 text-sm text-stone-600">这个话题下还没有消息。</p>
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <article key={message.msgId} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="line-clamp-4 text-sm leading-6 text-slate-900">{message.content}</p>
          <dl className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">发送人</dt>
              <dd className="mt-1 text-stone-700">{message.fromUsername}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">时间</dt>
              <dd className="mt-1 text-stone-700">{formatCreateTime(message.createTime)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-stone-400">对话</dt>
              <dd className="mt-1 text-stone-700">{message.conversationId ?? '未关联对话'}</dd>
            </div>
          </dl>
          <button
            type="button"
            disabled={!message.conversationId}
            onClick={() => message.conversationId && navigate(`/chat?conversationId=${message.conversationId}`)}
            className="mt-4 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            打开原始对话
          </button>
        </article>
      ))}
    </div>
  )
}
