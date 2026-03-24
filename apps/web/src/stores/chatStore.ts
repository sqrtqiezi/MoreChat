import { create } from 'zustand';

interface ChatState {
  selectedConversationId: string | null;
  isSidebarCollapsed: boolean;
  sidebarMode: 'conversations' | 'directory';
  selectConversation: (id: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setSidebarMode: (mode: 'conversations' | 'directory') => void;
  clearSelection: () => void;
  isAtBottom: boolean;
  setIsAtBottom: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  selectedConversationId: null,
  isSidebarCollapsed: false,
  sidebarMode: 'conversations',
  selectConversation: (id) => set({ selectedConversationId: id }),
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
  setSidebarMode: (mode) => set({ sidebarMode: mode }),
  clearSelection: () => set({ selectedConversationId: null }),
  isAtBottom: true,
  setIsAtBottom: (v) => set({ isAtBottom: v }),
}));
