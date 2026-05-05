// ABOUTME: Feed 页面入口，负责连接重要消息数据与知识库布局
// ABOUTME: 组合 useHighlights 与 HighlightsList 提供重要消息流展示

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { HighlightsList } from '../components/knowledge/HighlightsList'
import { useHighlights } from '../hooks/useHighlights'
import { useWebSocket } from '../hooks/useWebSocket'

export function FeedPage() {
  const highlights = useHighlights()
  const queryClient = useQueryClient()

  const handleWebSocketMessage = useCallback(
    (data: any) => {
      if (data?.event === 'highlight:new') {
        queryClient.invalidateQueries({ queryKey: ['highlights'] })
      }
    },
    [queryClient]
  )

  useWebSocket({
    onMessage: handleWebSocketMessage,
    onReconnect: () => {
      queryClient.invalidateQueries({ queryKey: ['highlights'] })
    },
  })

  return (
    <KnowledgeLayout>
      <HighlightsList highlights={highlights} />
    </KnowledgeLayout>
  )
}
