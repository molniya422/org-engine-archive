// Vite proxy handles /api -> backend in dev mode (http://localhost:5173)
// In Electron (file:// protocol), proxy doesn't exist — hit backend directly
let cachedPort: number | null = null;

const DEBUG =
  typeof window !== 'undefined' &&
  (window.location.protocol === 'file:' ||
    (window as any).__OE_DEBUG__ === true ||
    localStorage.getItem('oe-debug') === '1');

function dbg(...args: unknown[]) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log('[oe-api]', ...args);
}

async function getBaseUrl(): Promise<string> {
  if (window.location.protocol !== 'file:') {
    dbg('baseUrl: relative (http/dev)', window.location.href);
    return '';
  }
  if (cachedPort) {
    dbg('baseUrl: cached', cachedPort);
    return `http://localhost:${cachedPort}`;
  }
  // Try to get the actual port from Electron preload API
  try {
    const port = await (window as any).electronAPI?.getServerPort?.();
    dbg('baseUrl: ipc port', port, 'electronAPI?', !!(window as any).electronAPI);
    if (port) {
      cachedPort = port;
      return `http://localhost:${port}`;
    }
  } catch (e) {
    dbg('baseUrl: ipc failed', e);
  }
  dbg('baseUrl: fallback 5172');
  return 'http://localhost:5172';
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getBaseUrl();
  const url = `${base}${path}`;
  dbg('request →', options?.method ?? 'GET', url);
  const method = (options?.method ?? 'GET').toUpperCase();
  // Only set Content-Type when a body is actually being sent — DELETE/GET
  // without a body otherwise trips Fastify's body-parser with FST_ERR_CTP_EMPTY_JSON_BODY.
  const hasBody = options?.body != null && options.body !== '';
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, { ...options, method, headers });
  } catch (e: any) {
    dbg('request network error', path, e?.message ?? e);
    const msg = e?.name === 'AbortError'
      ? `请求超时：${path}`
      : `无法连接到后端服务（${path}）。请确认后端是否运行。`;
    throw new ApiError(0, msg);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    dbg('request http error', res.status, path, body);
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  const data = await res.json();
  dbg('request ←', path, Array.isArray(data) ? `array(${data.length})` : typeof data);
  return data;
}

/** Fetch raw text (for export/download). */
async function requestText(path: string): Promise<string> {
  const base = await getBaseUrl();
  const url = `${base}${path}`;
  dbg('requestText →', url);
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError(0, `无法连接到后端服务（${path}）。请确认后端是否运行。`);
  }
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.text();
}

export const api = {
  // Orgs
  listOrgs: () => request<any[]>('/api/v1/orgs'),
  getOrg: (id: string) => request<any>(`/api/v1/orgs/${id}`),
  saveOrg: (id: string, data: unknown) =>
    request<any>(`/api/v1/orgs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOrg: (id: string) =>
    request<any>(`/api/v1/orgs/${id}`, { method: 'DELETE' }),
  validateOrg: (id: string, data: unknown) =>
    request<any>(`/api/v1/orgs/${id}/validate`, { method: 'POST', body: JSON.stringify(data) }),

  // Skills
  listSkills: () => request<any[]>('/api/v1/skills'),
  scanSkills: (extraPaths?: string[]) =>
    request<any[]>('/api/v1/skills/scan', {
      method: 'POST',
      body: JSON.stringify({ extra_paths: extraPaths ?? [] }),
    }),

  // Export
  exportOrg: (id: string, format: 'yaml' | 'json' = 'yaml') =>
    requestText(`/api/v1/orgs/${id}/export?format=${format}`),

  // Runs
  getActiveRun: () => request<any>('/api/v1/runs'),
  listRuns: (orgId: string, limit = 10) =>
    request<{ runs: any[] }>(`/api/v1/runs?org_id=${encodeURIComponent(orgId)}&limit=${limit}`),
  startRun: (orgId: string, task: string, configPath?: string, workflowPath?: string) =>
    request<{ run_id: string }>('/api/v1/runs', {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId, task, config_path: configPath, workflow_path: workflowPath }),
    }),
  getRun: (id: string) => request<any>(`/api/v1/runs/${id}`),
  submitDecision: (runId: string, gateway: string, decision: unknown) =>
    request<any>(`/api/v1/runs/${runId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ gateway, decision }),
    }),
  cancelRun: (runId: string) =>
    request<any>(`/api/v1/runs/${runId}/cancel`, { method: 'POST' }),

  // Health
  getHealth: () => request<any>('/api/v1/health/details'),
  getOrgWorkflowStats: (orgId: string) =>
    request<any>(`/api/v1/orgs/${encodeURIComponent(orgId)}/workflow/stats`),

  // Templates
  listTemplates: (category?: string) =>
    request<any[]>(`/api/v1/templates${category && category !== 'all' ? `?category=${category}` : ''}`),
  getTemplate: (id: string) =>
    request<any>(`/api/v1/templates/${id}`),

  // Playbooks
  listPlaybooks: (category?: string) =>
    request<any[]>(`/api/v1/playbooks${category && category !== 'all' ? `?category=${category}` : ''}`),
  getPlaybook: (id: string) =>
    request<any>(`/api/v1/playbooks/${id}`),
  applyPlaybook: (id: string, mode: string, params: Record<string, unknown>, orgId?: string) =>
    request<any>(`/api/v1/playbooks/${id}/apply`, {
      method: 'POST',
      body: JSON.stringify({ mode, params, orgId }),
    }),

  // Workflows (workflow-config v2)
  listWorkflows: () => request<string[]>('/api/v1/workflows'),
  getWorkflow: (id: string) => request<any>(`/api/v1/workflows/${id}`),
  saveWorkflow: (id: string, data: unknown) =>
    request<any>(`/api/v1/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkflow: (id: string) =>
    request<any>(`/api/v1/workflows/${id}`, { method: 'DELETE' }),
  validateWorkflow: (data: unknown) =>
    request<any>(`/api/v1/workflows/x/validate`, { method: 'POST', body: JSON.stringify(data) }),

  // Insights (meetings / comm audit / product registry)
  getInsights: () => request<any>('/api/v1/insights'),

  // Learning loop (evolution events / report / proposals)
  listLearningEvents: () => request<any[]>('/api/learning/events'),
  getLearningReport: () => request<any>('/api/learning/report'),
  listProposals: () => request<any[]>('/api/learning/proposals'),
  approveProposal: (id: string) =>
    request<any>(`/api/learning/proposals/${id}/approve`, { method: 'POST' }),
  rejectProposal: (id: string) =>
    request<any>(`/api/learning/proposals/${id}/reject`, { method: 'POST' }),
};
