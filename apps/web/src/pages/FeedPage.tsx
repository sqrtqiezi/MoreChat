// ABOUTME: Feed 页面入口，负责连接重要消息数据与知识库布局
// ABOUTME: 组合 useHighlights 与 HighlightsList 提供重要消息流展示

import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { HighlightsList } from '../components/knowledge/HighlightsList'
import { useHighlights } from '../hooks/useHighlights'

export function FeedPage() {
  const highlights = useHighlights()

  return (
    <KnowledgeLayout>
      <HighlightsList highlights={highlights} />
    </KnowledgeLayout>
  )
}
