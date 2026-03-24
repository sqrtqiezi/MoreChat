import { memo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Message } from '../../types';
import { chatApi } from '../../api/chat';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { ImageLightbox } from './ImageLightbox';
import { EmojiMessage } from '../EmojiMessage';
import { WechatEmojiText } from '../WechatEmojiText';

function ReferImage({ msgId }: { msgId: string }) {
  const [showImage, setShowImage] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: imageData, isLoading, error, refetch } = useQuery({
    queryKey: ['image', msgId],
    queryFn: () => chatApi.getImageUrl(msgId, 'mid'),
    enabled: false,
    staleTime: Infinity,
    retry: 1,
  });

  const handleUpgradeToHd = async () => {
    const hdData = await chatApi.getImageUrl(msgId, 'hd');
    queryClient.setQueryData(['image', msgId], hdData);
  };

  const handleImageClick = () => {
    if (!showImage) {
      setShowImage(true);
      refetch();
    } else if (imageData) {
      setLightboxOpen(true);
    }
  };

  if (!showImage) {
    return (
      <button
        onClick={handleImageClick}
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-sm">点击查看图片</span>
      </button>
    );
  }

  if (isLoading) {
    return <span className="text-sm text-gray-400">加载中...</span>;
  }

  if (error) {
    return (
      <button onClick={() => refetch()} className="text-sm text-red-500 hover:text-red-700 underline">
        图片加载失败，点击重试
      </button>
    );
  }

  if (imageData) {
    return (
      <>
        <img
          src={imageData.imageUrl}
          alt="引用图片"
          className="max-w-[150px] max-h-[100px] rounded mt-1 cursor-pointer"
          loading="lazy"
          onClick={handleImageClick}
        />
        <ImageLightbox
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          imageUrl={imageData.imageUrl}
          hasHd={imageData.hasHd}
          onUpgradeToHd={handleUpgradeToHd}
        />
      </>
    );
  }

  return <span className="text-sm text-gray-500">[图片]</span>;
}

interface MessageItemProps {
  message: Message;
  isHighlighted?: boolean;
  onReply?: () => void;
}

export const MessageItem = memo(function MessageItem({ message, isHighlighted, onReply }: MessageItemProps) {
  const { isMine, senderName, content, timestamp, status, displayType, id: msgId } = message;
  const [showImage, setShowImage] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: imageData, isLoading: imageLoading, error: imageError, refetch } = useQuery({
    queryKey: ['image', msgId],
    queryFn: () => chatApi.getImageUrl(msgId, 'mid'),
    enabled: false,
    staleTime: Infinity,
    retry: 1,
  });

  const handleUpgradeToHd = async () => {
    const hdData = await chatApi.getImageUrl(msgId, 'hd');
    queryClient.setQueryData(['image', msgId], hdData);
  };

  const handleImageClick = () => {
    if (!showImage) {
      setShowImage(true);
      refetch();
    } else if (imageData) {
      setLightboxOpen(true);
    }
  };

  const renderContent = () => {
    if (!message.displayType || message.displayType === 'text') {
      return <span><WechatEmojiText text={content} /></span>;
    }

    if (displayType === 'image') {
      if (!showImage) {
        return (
          <button
            onClick={handleImageClick}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">点击查看图片</span>
          </button>
        );
      }

      if (imageLoading) {
        return (
          <div className="flex items-center gap-2 text-gray-500">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm">加载中...</span>
          </div>
        );
      }

      if (imageError) {
        return (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-red-500">图片加载失败</span>
            <button
              onClick={() => refetch()}
              className="text-sm text-blue-500 hover:text-blue-700 underline"
            >
              重试
            </button>
          </div>
        );
      }

      if (imageData) {
        return (
          <>
            <img
              src={imageData.imageUrl}
              alt="图片消息"
              className="max-w-[300px] rounded-lg cursor-pointer"
              loading="lazy"
              onClick={handleImageClick}
            />
            <ImageLightbox
              isOpen={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              imageUrl={imageData.imageUrl}
              hasHd={imageData.hasHd}
              onUpgradeToHd={handleUpgradeToHd}
            />
          </>
        );
      }
    }

    if (displayType === 'quote') {
      return (
        <div>
          {message.referMsg && (
            <div className="border-l-2 border-gray-300 pl-2 mb-1">
              <span className="text-xs text-gray-500">{message.referMsg.senderName}</span>
              {message.referMsg.type === 3 ? (
                <ReferImage msgId={message.referMsg.msgId} />
              ) : (
                <p className="text-sm text-gray-500 line-clamp-2">{message.referMsg.content}</p>
              )}
            </div>
          )}
          <span>{content}</span>
        </div>
      );
    }

    if (displayType === 'emoji') {
      return (
        <EmojiMessage
          msgId={msgId}
          displayContent={content}
        />
      );
    }

    // Non-text messages: gray italic style
    return <span className="text-gray-500 italic">{content}</span>;
  };

  // Get first letter for avatar
  const avatarLetter = senderName.charAt(0).toUpperCase();

  const replyButton = onReply ? (
    <button
      onClick={onReply}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 flex-shrink-0 self-center"
      title="回复"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    </button>
  ) : null;

  // Generate gradient color based on sender name
  const getGradient = (name: string) => {
    const colors = [
      'from-blue-400 to-blue-600',
      'from-purple-400 to-purple-600',
      'from-pink-400 to-pink-600',
      'from-green-400 to-green-600',
      'from-yellow-400 to-yellow-600',
      'from-red-400 to-red-600',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Format timestamp
  const formattedTime = formatDistanceToNow(new Date(timestamp), {
    addSuffix: true,
    locale: zhCN,
  });

  // Status text and color
  const getStatusDisplay = () => {
    switch (status) {
      case 'sending':
        return <span className="text-xs text-gray-400">发送中...</span>;
      case 'sent':
        return <span className="text-xs text-gray-400">已发送</span>;
      case 'failed':
        return <span className="text-xs text-red-500">发送失败</span>;
      default:
        return null;
    }
  };

  const highlightClass = isHighlighted ? 'bg-yellow-100 transition-colors duration-1000' : 'transition-colors duration-1000';

  if (isMine) {
    // Right-aligned (my messages)
    return (
      <div className={`group flex justify-end items-start gap-3 px-6 py-3 animate-fade-in ${highlightClass}`}>
        {replyButton}
        <div className="flex flex-col items-end max-w-[70%]">
        <div className="flex items-center gap-2 mb-1">
          {getStatusDisplay()}
          <span className="text-xs text-gray-500">{formattedTime}</span>
          {message.isRecalled && (
            <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">已撤回</span>
          )}
        </div>
          <div className="bg-blue-500 text-white rounded-2xl px-4 py-2.5 w-fit max-w-full break-words">
            {renderContent()}
          </div>
        </div>
        <div
          className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradient(
            senderName
          )} flex items-center justify-center text-white font-semibold flex-shrink-0`}
        >
          {avatarLetter}
        </div>
      </div>
    );
  }

  // Left-aligned (other's messages)
  return (
    <div className={`group flex justify-start items-start gap-3 px-6 py-3 animate-fade-in ${highlightClass}`}>
      <div
        className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGradient(
          senderName
        )} flex items-center justify-center text-white font-semibold flex-shrink-0`}
      >
        {avatarLetter}
      </div>
      <div className="flex flex-col items-start max-w-[70%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-900">{senderName}</span>
          <span className="text-xs text-gray-500">{formattedTime}</span>
          {message.isRecalled && (
            <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">已撤回</span>
          )}
        </div>
        <div className="bg-gray-100 text-gray-900 rounded-2xl px-4 py-2.5 w-fit max-w-full break-words">
          {renderContent()}
        </div>
      </div>
      {replyButton}
    </div>
  );
});
