interface ClientStatusProps {
  isOnline: boolean;
}

export function ClientStatus({ isOnline }: ClientStatusProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
      <div
        className={`w-2 h-2 rounded-full ${
          isOnline ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className="text-sm font-medium text-gray-700">
        {isOnline ? '在线' : '离线'}
      </span>
    </div>
  );
}
