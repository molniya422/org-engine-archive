import { create } from 'zustand';
import { api } from '@/api/client';
import { RunWsClient } from '@/api/ws';

type RunStatus = 'queued' | 'running' | 'awaiting_user' | 'done' | 'cancelled' | 'blocked';

interface RunState {
  runId: string;
  status: RunStatus;
  gateway: string | null;
  orgId: string;
  task: string;
  events: any[];
  createdAt: string;
  updatedAt: string;
}

interface RunStoreState {
  currentRun: RunState | null;
  loading: boolean;
  error: string | null;
  wsClient: RunWsClient;
  startRun: (orgId: string, task: string, configPath?: string) => Promise<string>;
  fetchRun: (id: string) => Promise<void>;
  submitDecision: (gateway: string, decision: unknown) => Promise<void>;
  cancelRun: () => Promise<void>;
  connectWs: (runId: string) => void;
  disconnectWs: () => void;
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  currentRun: null,
  loading: false,
  error: null,
  wsClient: new RunWsClient(),

  startRun: async (orgId, task, configPath) => {
    set({ loading: true, error: null });
    try {
      const { run_id } = await api.startRun(orgId, task, configPath);
      // Poll for initial state
      const state = await api.getRun(run_id);
      set({ currentRun: state, loading: false });
      get().connectWs(run_id);
      return run_id;
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      throw e;
    }
  },

  fetchRun: async (id) => {
    set({ loading: true, error: null });
    try {
      const state = await api.getRun(id);
      set({ currentRun: state, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  submitDecision: async (gateway, decision) => {
    const { currentRun } = get();
    if (!currentRun) throw new Error('No active run');
    set({ error: null });
    try {
      await api.submitDecision(currentRun.runId, gateway, decision);
      set(s => ({ currentRun: s.currentRun ? { ...s.currentRun, status: 'running', gateway: null } : null }));
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  cancelRun: async () => {
    const { currentRun } = get();
    if (!currentRun) return;
    try {
      await api.cancelRun(currentRun.runId);
      set(s => ({ currentRun: s.currentRun ? { ...s.currentRun, status: 'cancelled' } : null }));
      get().disconnectWs();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  connectWs: (runId) => {
    const client = get().wsClient;
    client.disconnect();
    client.on((data) => {
      if (data.type === 'state_snapshot') {
        set({ currentRun: data.state });
      } else {
        // Merge event into current run state
        set(s => ({
          currentRun: s.currentRun ? {
            ...s.currentRun,
            events: [...s.currentRun.events, data],
            status: data.type === 'gateway_prompt' ? 'awaiting_user' as RunStatus
                   : data.type === 'run_completed' ? (data.status === 'success' ? 'done' as RunStatus : data.status as RunStatus)
                   : s.currentRun.status,
            gateway: data.type === 'gateway_prompt' ? data.gateway : s.currentRun.gateway,
            updatedAt: new Date().toISOString(),
          } : null,
        }));
      }
    });
    client.connect(runId);
  },

  disconnectWs: () => {
    get().wsClient.disconnect();
  },
}));
