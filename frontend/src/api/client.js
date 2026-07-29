// Vite proxy handles /api -> backend in dev mode (http://localhost:5173)
// In Electron (file:// protocol), proxy doesn't exist — hit backend directly
let cachedPort = null;
async function getBaseUrl() {
    if (window.location.protocol !== 'file:')
        return '';
    if (cachedPort)
        return `http://localhost:${cachedPort}`;
    // Try to get the actual port from Electron preload API
    try {
        const port = await window.electronAPI?.getServerPort?.();
        if (port) {
            cachedPort = port;
            return `http://localhost:${port}`;
        }
    }
    catch { /* fall through */ }
    return 'http://localhost:5172';
}
export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}
async function request(path, options) {
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
async function requestText(path) {
    const base = await getBaseUrl();
    const res = await fetch(`${base}${path}`);
    if (!res.ok)
        throw new ApiError(res.status, res.statusText);
    return res.text();
}
export const api = {
    // Orgs
    listOrgs: () => request('/api/v1/orgs'),
    getOrg: (id) => request(`/api/v1/orgs/${id}`),
    saveOrg: (id, data) => request(`/api/v1/orgs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteOrg: (id) => request(`/api/v1/orgs/${id}`, { method: 'DELETE' }),
    validateOrg: (id, data) => request(`/api/v1/orgs/${id}/validate`, { method: 'POST', body: JSON.stringify(data) }),
    // Skills
    listSkills: () => request('/api/v1/skills'),
    scanSkills: (extraPaths) => request('/api/v1/skills/scan', {
        method: 'POST',
        body: JSON.stringify({ extra_paths: extraPaths ?? [] }),
    }),
    // Export
    exportOrg: (id, format = 'yaml') => requestText(`/api/v1/orgs/${id}/export?format=${format}`),
    // Runs
    getActiveRun: () => request('/api/v1/runs'),
    startRun: (orgId, task, configPath) => request('/api/v1/runs', {
        method: 'POST',
        body: JSON.stringify({ org_id: orgId, task, config_path: configPath }),
    }),
    getRun: (id) => request(`/api/v1/runs/${id}`),
    submitDecision: (runId, gateway, decision) => request(`/api/v1/runs/${runId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ gateway, decision }),
    }),
    cancelRun: (runId) => request(`/api/v1/runs/${runId}/cancel`, { method: 'POST' }),
};
