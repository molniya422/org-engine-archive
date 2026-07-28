// Vite proxy handles /api -> backend in dev mode (http://localhost:5173)
// In Electron (file:// protocol), proxy doesn't exist — hit backend directly
let cachedPort: number | null = null;

async function getBaseUrl(): Promise<string> {
  if (window.location.protocol !== 'file:') return '';
  if (cachedPort) return `http://localhost:${cachedPort}`;
  // Try to get the actual port from Electron preload API
  try {
    const port = await (window as any).electronAPI?.getServerPort?.();
    if (port) { cachedPort = port; return `http://localhost:${port}`; }
  } catch { /* fall through */ }
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
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json();
}

/** Fetch raw text (for export/download). */
async function requestText(path: string): Promise<string> {
  const base = await getBaseUrl();
  const res = await fetch(`${base}${path}`);
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
  startRun: (orgId: string, task: string, configPath?: string) =>
    request<{ run_id: string }>('/api/v1/runs', {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId, task, config_path: configPath }),
    }),
  getRun: (id: string) => request<any>(`/api/v1/runs/${id}`),
  submitDecision: (runId: string, gateway: string, decision: unknown) =>
    request<any>(`/api/v1/runs/${runId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ gateway, decision }),
    }),
  cancelRun: (runId: string) =>
    request<any>(`/api/v1/runs/${runId}/cancel`, { method: 'POST' }),
};
