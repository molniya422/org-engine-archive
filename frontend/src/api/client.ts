const BASE = ''; // Vite proxy handles /api -> backend

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json();
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

  // Runs
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
