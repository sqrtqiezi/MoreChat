import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useSendMessage } from '../../hooks/useSendMessage';
import { useSendImage } from '../../hooks/useSendImage';
import { compressImage } from '../../utils/imageCompression';
import { ImageInput } from './ImageInput';
import { ImagePreview } from './ImagePreview';
import type { Message } from '../../types';

interface MessageInputProps {
  conversationId: string | null;
  disabled?: boolean;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
}

export function MessageInput({ conversationId, disabled = false, replyingTo = null, onCancelReply = () => {} }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { mutate: sendMessage, isPending, error } = useSendMessage();
  const { mutate: sendImage, isPending: isImagePending } = useSendImage();

  // Auto-focus when conversation is selected
  useEffect(() => {
    if (conversationId && textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [conversationId, disabled]);

  // Handle paste event for images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled || !conversationId || isImagePending) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageSelect(file);
            e.preventDefault();
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [conversationId, disabled, isImagePending]);

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
        {
          conversationId,
          content: trimmedContent,
          replyToMsgId: replyingTo?.id,
          replyingTo: replyingTo || undefined,
        },
        {
          onSuccess: () => {
            setContent('');
            onCancelReply();
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
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleImageSelect = (file: File) => {
    setSelectedImage(file);
    setImageError('');
  };

  const handleImageError = (error: string) => {
    setImageError(error);
  };

  const handleImageSend = async () => {
    if (!selectedImage || !conversationId) return;

    const compressed = await compressImage(selectedImage);
    sendImage(
      { conversationId, imageFile: compressed },
      {
        onSuccess: () => {
          setSelectedImage(null);
          setImageError('');
        },
        onError: () => {
          setImageError('图片发送失败，请重试');
        },
      }
    );
  };

  const handleImageCancel = () => {
    setSelectedImage(null);
    setImageError('');
  };

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-gray-50 border-l-2 border-blue-500 rounded">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-blue-600 font-medium">{replyingTo.senderName}</span>
            <p className="text-sm text-gray-500 truncate">{replyingTo.content}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {(error || imageError) && (
        <div className="mb-2 text-red-500 text-sm">
          {imageError || '发送失败，请重试'}
        </div>
      )}
      {selectedImage && (
        <div className="mb-3">
          <ImagePreview
            file={selectedImage}
            onSend={handleImageSend}
            onCancel={handleImageCancel}
            isSending={isImagePending}
          />
        </div>
      )}
      <div className="flex items-end gap-3">
        <ImageInput
          onImageSelect={handleImageSelect}
          onError={handleImageError}
          disabled={disabled || !conversationId || isImagePending}
        />
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行, Esc 清空)"
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
