interface NewMessageIndicatorProps {
  count: number;
  onClick: () => void;
}

export function NewMessageIndicator({ count, onClick }: NewMessageIndicatorProps) {
  if (count <= 0) return null;

  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
        bg-blue-500 hover:bg-blue-600 text-white text-sm
        px-4 py-2 rounded-full shadow-lg
        transition-all duration-200
        cursor-pointer"
    >
      ↓ {count} 条新消息
    </button>
  );
}
