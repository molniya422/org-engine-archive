import { create } from 'zustand';
import { api } from '@/api/client';
export const useOrgStore = create((set) => ({
    orgs: [],
    currentOrg: null,
    loading: false,
    error: null,
    fetchOrgs: async () => {
        set({ loading: true, error: null });
        try {
            const orgs = await api.listOrgs();
            set({ orgs, loading: false });
        }
        catch (e) {
            set({ error: e.message, loading: false });
        }
    },
    loadOrg: async (id) => {
        set({ loading: true, error: null });
        try {
            const currentOrg = await api.getOrg(id);
            set({ currentOrg, loading: false });
        }
        catch (e) {
            set({ error: e.message, loading: false });
        }
    },
    saveOrg: async (id, data) => {
        set({ error: null });
        try {
            await api.saveOrg(id, data);
            set({ currentOrg: data });
        }
        catch (e) {
            set({ error: e.message });
            throw e;
        }
    },
    deleteOrg: async (id) => {
        set({ error: null });
        try {
            await api.deleteOrg(id);
            set(s => ({ orgs: s.orgs.filter(o => o.id !== id), currentOrg: s.currentOrg?.id === id ? null : s.currentOrg }));
        }
        catch (e) {
            set({ error: e.message });
        }
    },
}));
