import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Conversation } from '../../types';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

export function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: ConversationItemProps) {
  const firstLetter = conversation.name.charAt(0).toUpperCase();
  const unreadDisplay = conversation.unreadCount > 99 ? '99+' : conversation.unreadCount;

  // Generate gradient background based on conversation id
  const gradients = [
    'bg-gradient-to-br from-blue-400 to-blue-600',
    'bg-gradient-to-br from-purple-400 to-purple-600',
    'bg-gradient-to-br from-pink-400 to-pink-600',
    'bg-gradient-to-br from-green-400 to-green-600',
    'bg-gradient-to-br from-yellow-400 to-yellow-600',
    'bg-gradient-to-br from-red-400 to-red-600',
  ];
  const gradientClass = gradients[parseInt(conversation.id) % gradients.length];

  const relativeTime = formatDistanceToNow(new Date(conversation.updatedAt), {
    addSuffix: true,
    locale: zhCN,
  });

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 border-l-4 ${
        isSelected
          ? 'bg-blue-50 border-blue-500'
          : 'border-transparent hover:bg-gray-50 hover:border-gray-200'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg flex-shrink-0 ${gradientClass}`}
      >
        {firstLetter}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-900 truncate">
            {conversation.name}
          </h3>
          <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
            {relativeTime}
          </span>
        </div>
        <p className="text-sm text-gray-600 truncate">
          {conversation.lastMessage || '暂无消息'}
        </p>
      </div>

      {/* Unread badge */}
      {conversation.unreadCount > 0 && (
        <div className="flex-shrink-0 bg-red-500 text-white text-xs font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
          {unreadDisplay}
        </div>
      )}
    </div>
  );
}
