import { useChatStore } from '../../stores/chatStore';

export function SidebarRail() {
  const sidebarMode = useChatStore((state) => state.sidebarMode);
  const toggleSidebarCollapsed = useChatStore((state) => state.toggleSidebarCollapsed);
  const setSidebarMode = useChatStore((state) => state.setSidebarMode);

  return (
    <div className="w-14 border-r border-gray-200 bg-white/80 backdrop-blur flex flex-col items-center justify-between py-3">
      <button
        type="button"
        onClick={toggleSidebarCollapsed}
        aria-label="切换侧边栏"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition hover:bg-gray-100"
      >
        ≡
      </button>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-pressed={sidebarMode === 'conversations'}
          onClick={() => setSidebarMode('conversations')}
          className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
            sidebarMode === 'conversations'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          会话
        </button>
        <button
          type="button"
          aria-pressed={sidebarMode === 'directory'}
          onClick={() => setSidebarMode('directory')}
          className={`rounded-xl px-2 py-2 text-xs font-medium transition ${
            sidebarMode === 'directory'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          联系人
        </button>
      </div>

      <div className="h-10 w-10" />
    </div>
  );
}
