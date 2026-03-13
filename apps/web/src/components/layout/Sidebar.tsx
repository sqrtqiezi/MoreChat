import { useChatStore } from '../../stores/chatStore';
import { SidebarPanel } from './SidebarPanel';
import { SidebarRail } from './SidebarRail';

export function Sidebar() {
  const isSidebarCollapsed = useChatStore((state) => state.isSidebarCollapsed);

  return (
    <div className="flex h-full overflow-hidden border-r border-gray-200 bg-gray-50">
      <SidebarRail />
      {!isSidebarCollapsed ? <SidebarPanel /> : null}
    </div>
  );
}
