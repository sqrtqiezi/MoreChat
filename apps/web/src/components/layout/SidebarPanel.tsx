import { ConversationList } from '../chat/ConversationList';
import { DirectoryPanel } from '../chat/DirectoryPanel';
import { ClientStatus } from './ClientStatus';
import { SidebarSearchBar } from './SidebarSearchBar';
import { useChatStore } from '../../stores/chatStore';

export function SidebarPanel() {
  const sidebarMode = useChatStore((state) => state.sidebarMode);

  return (
    <div className="flex min-w-0 w-72 flex-col bg-gray-50">
      <ClientStatus isOnline={true} />
      <SidebarSearchBar />
      {sidebarMode === 'conversations' ? <ConversationList /> : <DirectoryPanel />}
    </div>
  );
}
