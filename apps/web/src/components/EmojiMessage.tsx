import { useState, useEffect } from 'react'
import { getWebSocketClient } from '../api/websocket'
import styles from './EmojiMessage.module.css'

interface EmojiMessageProps {
  msgId: string
  conversationId: string
  displayContent: string
}

export function EmojiMessage({ msgId, conversationId, displayContent }: EmojiMessageProps) {
  const [emojiUrl, setEmojiUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEmojiUrl()

    const wsClient = getWebSocketClient()

    const handleEmojiDownloaded = (data: any) => {
      if (data.type === 'emoji_downloaded' && data.msgId === msgId) {
        setEmojiUrl(data.ossUrl)
        setLoading(false)
      }
    }

    wsClient.addMessageHandler(handleEmojiDownloaded)

    return () => {
      wsClient.removeMessageHandler(handleEmojiDownloaded)
    }
  }, [msgId])

  const fetchEmojiUrl = async () => {
    try {
      const response = await fetch(`/api/messages/${msgId}/emoji`)
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data.ossUrl) {
          setEmojiUrl(result.data.ossUrl)
        }
      }
    } catch (error) {
      console.error('Failed to fetch emoji URL:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !emojiUrl) {
    return <span className={styles.placeholder}>{displayContent}</span>
  }

  return (
    <img
      src={emojiUrl}
      alt="表情"
      className={styles.emoji}
    />
  )
}
