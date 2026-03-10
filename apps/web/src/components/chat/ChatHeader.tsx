interface ChatHeaderProps {
  conversationName: string;
  conversationType?: 'private' | 'group';
  memberCount?: number;
}

export function ChatHeader({ conversationName, conversationType, memberCount }: ChatHeaderProps) {
  return (
    <div className="h-16 px-6 flex items-center border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{conversationName}</h2>
        {conversationType === 'group' && memberCount ? (
          <span className="text-sm text-gray-500">({memberCount})</span>
        ) : null}
      </div>
    </div>
  );
}
