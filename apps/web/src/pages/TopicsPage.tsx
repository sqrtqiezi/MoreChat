import { KnowledgeLayout } from '../components/knowledge/KnowledgeLayout'
import { TopicTimeline } from '../components/knowledge/TopicTimeline'
import { useTopics } from '../hooks/useTopics'

export function TopicsPage() {
  const topics = useTopics()

  return (
    <KnowledgeLayout>
      <TopicTimeline topics={topics} />
    </KnowledgeLayout>
  )
}
