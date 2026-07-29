import { create } from 'zustand';
import { api } from '@/api/client';
export const useSkillsStore = create((set) => ({
    skills: [],
    loading: false,
    error: null,
    fetchSkills: async () => {
        set({ loading: true, error: null });
        try {
            const skills = await api.listSkills();
            set({ skills, loading: false });
        }
        catch (e) {
            set({ error: e.message, loading: false });
        }
    },
    scanSkills: async (extraPaths) => {
        set({ loading: true, error: null });
        try {
            const skills = await api.scanSkills(extraPaths);
            set({ skills, loading: false });
        }
        catch (e) {
            set({ error: e.message, loading: false });
        }
    },
}));
