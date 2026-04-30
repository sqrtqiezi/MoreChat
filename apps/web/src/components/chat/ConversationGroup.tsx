// ABOUTME: 会话分组组件
// ABOUTME: 支持折叠/展开，显示分组标题和会话数量

import { ConversationItem } from './ConversationItem'
import type { Conversation } from '../../types'

interface ConversationGroupProps {
  title: string
  count: number
  conversations: Conversation[]
  isCollapsed: boolean
  onToggle: () => void
  selectedId: string | null
  onSelect: (id: string) => void
}

export function ConversationGroup({
  title,
  count,
  conversations,
  isCollapsed,
  onToggle,
  selectedId,
  onSelect,
}: ConversationGroupProps) {
  return (
    <div className="border-b border-gray-200">
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
      >
        <span>
          {title} ({count})
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {!isCollapsed && (
        <div>
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isSelected={selectedId === conversation.id}
              onClick={() => onSelect(conversation.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
