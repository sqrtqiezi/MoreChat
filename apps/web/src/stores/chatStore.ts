import { create } from 'zustand';

interface ChatState {
  selectedConversationId: string | null;
  selectConversation: (id: string | null) => void;
  clearSelection: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  selectedConversationId: null,
  selectConversation: (id) => set({ selectedConversationId: id }),
  clearSelection: () => set({ selectedConversationId: null }),
}));
