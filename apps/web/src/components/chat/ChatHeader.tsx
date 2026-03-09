interface ChatHeaderProps {
  conversationName: string;
}

export function ChatHeader({ conversationName }: ChatHeaderProps) {
  return (
    <div className="h-16 px-6 flex items-center border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{conversationName}</h2>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-sm text-gray-500">在线</span>
        </div>
      </div>
    </div>
  );
}
