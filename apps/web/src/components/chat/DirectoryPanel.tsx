import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../../api/chat';
import { useDirectory } from '../../hooks/useDirectory';
import { useChatStore } from '../../stores/chatStore';
import { EmptyState } from '../common/EmptyState';
import { DirectoryItem } from './DirectoryItem';
import { DirectorySection } from './DirectorySection';

export function DirectoryPanel() {
  const sidebarMode = useChatStore((state) => state.sidebarMode);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useDirectory(sidebarMode === 'directory');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({ contacts: true, groups: true });

  const normalizedQuery = query.trim().toLowerCase();
  const contacts = (data?.contacts ?? []).filter((contact) => {
    if (!normalizedQuery) return true;
    return [contact.remark, contact.nickname, contact.username]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery));
  });
  const groups = (data?.groups ?? []).filter((group) => {
    if (!normalizedQuery) return true;
    return [group.name, group.roomUsername]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  async function openItem(
    item:
      | { type: 'private'; username: string; conversationId: string | null }
      | { type: 'group'; roomUsername: string; conversationId: string | null }
  ) {
    const conversationId = item.conversationId
      ?? (await chatApi.openConversation(
        item.type === 'private'
          ? { type: 'private', username: item.username }
          : { type: 'group', roomUsername: item.roomUsername }
      )).conversationId;

    selectConversation(conversationId);
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['directory'] });
  }

  if (isLoading) {
    return <div className="flex-1 p-4 text-sm text-gray-500">正在加载目录...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState title="加载失败" description="无法加载联系人和群组目录" />
      </div>
    );
  }

  if (!data || (contacts.length === 0 && groups.length === 0)) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="border-b border-gray-200 px-4 py-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索联系人或群组"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400"
          />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={normalizedQuery ? '没有匹配结果' : '暂无目录数据'}
            description={normalizedQuery ? '尝试其他搜索词' : '联系人和群组同步后会显示在这里'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索联系人或群组"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <DirectorySection
          title="联系人"
          expanded={expanded.contacts}
          count={contacts.length}
          onToggle={() => setExpanded((current) => ({ ...current, contacts: !current.contacts }))}
        >
          {contacts.length > 0 ? contacts.map((contact) => (
            <DirectoryItem
              key={contact.id}
              name={contact.remark || contact.nickname || contact.username}
              subtitle={contact.username}
              avatar={contact.avatar}
              onClick={() => openItem({
                type: 'private',
                username: contact.username,
                conversationId: contact.conversationId,
              })}
            />
          )) : (
            <div className="px-4 pb-4 text-xs text-gray-400">暂无联系人</div>
          )}
        </DirectorySection>

        <DirectorySection
          title="群聊"
          expanded={expanded.groups}
          count={groups.length}
          onToggle={() => setExpanded((current) => ({ ...current, groups: !current.groups }))}
        >
          {groups.length > 0 ? groups.map((group) => (
            <DirectoryItem
              key={group.id}
              name={group.name}
              subtitle={group.roomUsername}
              avatar={group.avatar}
              onClick={() => openItem({
                type: 'group',
                roomUsername: group.roomUsername,
                conversationId: group.conversationId,
              })}
            />
          )) : (
            <div className="px-4 pb-4 text-xs text-gray-400">暂无群聊</div>
          )}
        </DirectorySection>
      </div>
    </div>
  );
}
