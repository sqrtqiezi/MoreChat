import { ConversationList } from '../chat/ConversationList';
import { ClientStatus } from './ClientStatus';

export function Sidebar() {
  return (
    <div className="w-80 bg-gray-100 border-r border-gray-200 flex flex-col h-full">
      <ClientStatus isOnline={true} />
      <ConversationList />
    </div>
  );
}
