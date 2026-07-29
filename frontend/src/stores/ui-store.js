import { create } from 'zustand';
export const useUiStore = create((set) => ({
    sidebarCollapsed: false,
    editorTab: 'tree',
    theme: 'light',
    toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setEditorTab: (tab) => set({ editorTab: tab }),
}));
