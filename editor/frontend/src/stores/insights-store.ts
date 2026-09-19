import { create } from 'zustand';
import { api } from '@/api/client';

/**
 * 治理洞察 store：会议记录 / 通信审计 / 产物注册表。
 * 数据来自 /api/v1/insights（引擎状态目录的 meetings.jsonl / comm.jsonl / products.json）。
 */
interface InsightsState {
  meetings: any[];
  comm: any[];
  products: any[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

export const useInsightsStore = create<InsightsState>((set) => ({
  meetings: [],
  comm: [],
  products: [],
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.getInsights();
      set({
        meetings: data.meetings ?? [],
        comm: data.comm ?? [],
        products: data.products ?? [],
        loading: false,
      });
    } catch (e: any) {
      set({ error: e?.message ?? '获取洞察数据失败', loading: false });
    }
  },
}));
