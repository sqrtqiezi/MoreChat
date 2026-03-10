import { memo } from 'react';
import { Message } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface MessageItemProps {
  message: Message;
}

export const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  const { isMine, senderName, content, timestamp, status } = message;

  const renderContent = () => {
    if (!message.displayType || message.displayType === 'text') {
      return <span>{content}</span>;
    }
    // Non-text messages: gray italic style
    return <span className="text-gray-500 italic">{content}</span>;
  };

  // Get first letter for avatar
  const avatarLetter = senderName.charAt(0).toUpperCase();

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

  if (isMine) {
    // Right-aligned (my messages)
    return (
      <div className="flex justify-end items-start gap-3 px-6 py-3 animate-fade-in">
        <div className="flex flex-col items-end max-w-[70%]">
          <div className="flex items-center gap-2 mb-1">
            {getStatusDisplay()}
            <span className="text-xs text-gray-500">{formattedTime}</span>
          </div>
          <div className="bg-blue-500 text-white rounded-2xl px-4 py-2.5 break-words">
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
    <div className="flex justify-start items-start gap-3 px-6 py-3 animate-fade-in">
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
        </div>
        <div className="bg-gray-100 text-gray-900 rounded-2xl px-4 py-2.5 break-words">
          {renderContent()}
        </div>
      </div>
    </div>
  );
});

