import { create } from 'zustand';

type OrgEditorTab = 'structure' | 'workflow' | 'skills' | 'validation' | 'run' | 'evolution';

interface UiStoreState {
  sidebarCollapsed: boolean;
  editorTab: OrgEditorTab;
  theme: 'light';
  toggleSidebar: () => void;
  setEditorTab: (tab: OrgEditorTab) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  sidebarCollapsed: false,
  editorTab: 'structure',
  theme: 'light',
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setEditorTab: (tab) => set({ editorTab: tab }),
}));
