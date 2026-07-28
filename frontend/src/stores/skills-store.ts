import { create } from 'zustand';
import { api } from '@/api/client';

interface SkillEntry {
  name: string;
  description: string;
  source: 'skill' | 'agentType';
  path?: string;
}

interface SkillsStoreState {
  skills: SkillEntry[];
  loading: boolean;
  error: string | null;
  fetchSkills: () => Promise<void>;
  scanSkills: (extraPaths?: string[]) => Promise<void>;
}

export const useSkillsStore = create<SkillsStoreState>((set) => ({
  skills: [],
  loading: false,
  error: null,

  fetchSkills: async () => {
    set({ loading: true, error: null });
    try {
      const skills = await api.listSkills();
      set({ skills, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  scanSkills: async (extraPaths?: string[]) => {
    set({ loading: true, error: null });
    try {
      const skills = await api.scanSkills(extraPaths);
      set({ skills, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
}));
