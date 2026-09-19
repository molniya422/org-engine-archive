import { create } from 'zustand';
import { api, ApiError } from '@/api/client';
import { toast } from '@/stores/toast-store';

export interface OrgMeta {
  id: string;
  name: string;
  deptCount: number;
  roleCount: number;
}

interface OrgStoreState {
  orgs: OrgMeta[];
  currentOrg: any | null;
  loading: boolean;
  error: string | null;
  fetchOrgs: () => Promise<void>;
  loadOrg: (id: string) => Promise<void>;
  saveOrg: (id: string, data: unknown) => Promise<void>;
  deleteOrg: (id: string) => Promise<void>;
}

export const useOrgStore = create<OrgStoreState>((set) => ({
  orgs: [],
  currentOrg: null,
  loading: false,
  error: null,

  fetchOrgs: async () => {
    set({ loading: true, error: null });
    try {
      const orgs = await api.listOrgs();
      set({ orgs, loading: false });
    } catch (e) {
      set({ error: (e as ApiError).message, loading: false });
    }
  },

  loadOrg: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const currentOrg = await api.getOrg(id);
      set({ currentOrg, loading: false });
    } catch (e) {
      set({ error: (e as ApiError).message, loading: false });
    }
  },

  saveOrg: async (id: string, data: unknown) => {
    set({ error: null });
    try {
      await api.saveOrg(id, data);
      set({ currentOrg: data });
    } catch (e) {
      const msg = (e as ApiError).message || '保存失败';
      set({ error: msg });
      toast.error(msg);
      throw e;
    }
  },

  deleteOrg: async (id: string) => {
    set({ error: null });
    try {
      await api.deleteOrg(id);
      set(s => ({ orgs: s.orgs.filter(o => o.id !== id), currentOrg: s.currentOrg?.id === id ? null : s.currentOrg }));
    } catch (e) {
      const msg = (e as ApiError).message || '删除失败';
      set({ error: msg });
      toast.error(msg);
    }
  },
}));
