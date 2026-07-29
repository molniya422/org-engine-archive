import { create } from 'zustand';

type OrgEditorTab = 'tree' | 'canvas' | 'workflow';

interface UiStoreState {
  sidebarCollapsed: boolean;
  editorTab: OrgEditorTab;
  theme: 'light';
  toggleSidebar: () => void;
  setEditorTab: (tab: OrgEditorTab) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  sidebarCollapsed: false,
  editorTab: 'tree',
  theme: 'light',
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setEditorTab: (tab) => set({ editorTab: tab }),
}));
