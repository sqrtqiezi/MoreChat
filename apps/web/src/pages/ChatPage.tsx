import { Sidebar } from '../components/layout/Sidebar';
import { mockConversations } from '../utils/mockData';

export function ChatPage() {
  return (
    <div className="h-screen flex">
      <Sidebar conversations={mockConversations} />

      {/* ChatWindow */}
      <div className="flex-1 bg-white">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-gray-900">聊天窗口</h2>
          <p className="text-sm text-gray-600 mt-2">ChatWindow 占位内容</p>
        </div>
      </div>
    </div>
  );
}
