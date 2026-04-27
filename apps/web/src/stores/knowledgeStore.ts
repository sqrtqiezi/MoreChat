import { create } from 'zustand';
import type { SearchFilters, SearchMode } from '../types';

interface KnowledgeState {
  query: string;
  mode: SearchMode;
  filters: SearchFilters;
  selectedResultId: string | null;
  setQuery: (query: string) => void;
  setMode: (mode: SearchMode) => void;
  setFilters: (filters: SearchFilters) => void;
  selectResult: (msgId: string | null) => void;
  reset: () => void;
}

const initialState = {
  query: '',
  mode: 'keyword' as SearchMode,
  filters: {},
  selectedResultId: null,
};

export const useKnowledgeStore = create<KnowledgeState>()((set) => ({
  ...initialState,
  setQuery: (query) => set({ query }),
  setMode: (mode) => set({ mode }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  selectResult: (msgId) => set({ selectedResultId: msgId }),
  reset: () => set(initialState),
}));
