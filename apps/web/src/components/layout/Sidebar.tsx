import { Conversation } from '../../types';
import { ConversationList } from '../chat/ConversationList';
import { ClientStatus } from './ClientStatus';

interface SidebarProps {
  conversations: Conversation[];
}

export function Sidebar({ conversations }: SidebarProps) {
  return (
    <div className="w-80 bg-gray-100 border-r border-gray-200 flex flex-col h-full">
      <ClientStatus isOnline={true} />
      <ConversationList conversations={conversations} />
    </div>
  );
}
