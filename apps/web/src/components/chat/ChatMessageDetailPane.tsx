// ABOUTME: 消息详情面板，显示搜索结果的上下文或完整会话
// ABOUTME: 支持上下文模式（前后各10条）和完整会话模式切换
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMessagesAround } from '../../hooks/useMessagesAround'
import { useMessages } from '../../hooks/useMessages'
import { MessageItem } from './MessageItem'
import type { Message } from '../../types'

type ViewMode = 'context' | 'full'

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <svg className="w-20 h-20 text-stone-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <p className="text-stone-600 text-center">从左侧选择一条搜索结果</p>
      <p className="text-sm text-stone-500 mt-2 text-center">将在此处显示消息上下文</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex items-center gap-2 text-stone-600">
        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-sm">加载中...</span>
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <p className="text-sm text-red-600 text-center">加载失败</p>
      <p className="text-xs text-stone-500 mt-2 text-center">{message}</p>
    </div>
  )
}

interface MessageListViewProps {
  messages: Message[]
  targetMsgId: string | null
}

function MessageListView({ messages, targetMsgId }: MessageListViewProps) {
  const targetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [targetMsgId, messages])

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((message) => {
        const isTarget = message.id === targetMsgId
        return (
          <div
            key={message.id}
            ref={isTarget ? targetRef : undefined}
            className={isTarget ? 'ring-2 ring-blue-400 ring-inset rounded-lg' : undefined}
          >
            <MessageItem message={message} />
          </div>
        )
      })}
    </div>
  )
}

function ContextView({ conversationId, msgId }: { conversationId: string; msgId: string }) {
  const { data, isLoading, error } = useMessagesAround(conversationId, msgId)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error instanceof Error ? error.message : '未知错误'} />
  if (!data) return null

  return <MessageListView messages={data.messages} targetMsgId={msgId} />
}

function FullView({ conversationId, msgId }: { conversationId: string; msgId: string }) {
  const { messages, isLoading, error } = useMessages(conversationId)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState message={error instanceof Error ? error.message : '未知错误'} />
  if (!messages) return null

  return <MessageListView messages={messages} targetMsgId={msgId} />
}

export function ChatMessageDetailPane() {
  const [searchParams] = useSearchParams()
  const msgId = searchParams.get('msgId')
  const conversationId = searchParams.get('conversationId')
  const [mode, setMode] = useState<ViewMode>('context')

  // 切换到新消息时重置为上下文模式
  useEffect(() => {
    setMode('context')
  }, [msgId])

  if (!msgId || !conversationId) {
    return (
      <div className="flex-1 bg-white">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="flex-1 bg-white flex flex-col min-w-0">
      <div className="p-4 border-b border-stone-200 flex items-center justify-between shrink-0">
        <h2 className="text-lg font-semibold text-stone-900">
          {mode === 'context' ? '消息上下文' : '完整会话'}
        </h2>
        <button
          type="button"
          onClick={() => setMode(mode === 'context' ? 'full' : 'context')}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50"
        >
          {mode === 'context' ? '查看完整会话' : '返回上下文'}
        </button>
      </div>

      {mode === 'context' ? (
        <ContextView conversationId={conversationId} msgId={msgId} />
      ) : (
        <FullView conversationId={conversationId} msgId={msgId} />
      )}
    </div>
  )
}
