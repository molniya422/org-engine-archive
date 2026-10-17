import { create } from 'zustand';

/**
 * P8.4 — 界面模式。默认「个人模式」：只给小白用户的入口（事项/规则/隐私/
 * 记忆/学习提案）。「高级模式」保留开发者控制台（组织/工作流/运行事件/
 * 学习洞察/诊断）——开发者没有失去调试能力，普通用户不被内部模型暴露。
 */
export type UiMode = 'personal' | 'advanced';

interface ModeState {
  mode: UiMode;
  setMode: (mode: UiMode) => void;
  toggleMode: () => void;
}

export const useModeStore = create<ModeState>((set, get) => ({
  mode: typeof window !== 'undefined'
    ? (localStorage.getItem('ui-mode') as UiMode) || 'personal'
    : 'personal',
  setMode: (mode) => {
    localStorage.setItem('ui-mode', mode);
    set({ mode });
  },
  toggleMode: () => {
    const next = get().mode === 'personal' ? 'advanced' : 'personal';
    localStorage.setItem('ui-mode', next);
    set({ mode: next });
  },
}));