import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useSendMessage } from '../../hooks/useSendMessage';

interface MessageInputProps {
  conversationId: string | null;
  disabled?: boolean;
}

export function MessageInput({ conversationId, disabled = false }: MessageInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { mutate: sendMessage, isPending, error } = useSendMessage();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [content]);

  const handleSend = () => {
    const trimmedContent = content.trim();
    if (trimmedContent && !disabled && !isPending && conversationId) {
      sendMessage(
        { conversationId, content: trimmedContent },
        {
          onSuccess: () => {
            setContent('');
            // Reset textarea height
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
            }
          },
        }
      );
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {error && (
        <div className="mb-2 text-red-500 text-sm">
          发送失败，请重试
        </div>
      )}
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          disabled={disabled || isPending || !conversationId}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[44px] max-h-[200px]"
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={disabled || isPending || !content.trim() || !conversationId}
          className="px-6 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {isPending ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
}
