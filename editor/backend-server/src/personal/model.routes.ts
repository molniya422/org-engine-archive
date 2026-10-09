/**
 * P2.2/P2.4 — local model diagnostics routes (read-only).
 *
 * Reports provider health from the engine's perspective: which local
 * backend is configured, whether it is reachable, what models are loaded,
 * and what the user can do when it is not (rules/manual mode). This endpoint
 * NEVER contacts a cloud service and NEVER uploads model files.
 *
 * The engine is Python; the backend probes it via the same HTTP endpoints the
 * Python adapters use (127.0.0.1). Provider selection comes from env:
 *   ORG_ENGINE_MODEL_PROVIDER = ollama | llama.cpp | fake | none
 *   ORG_ENGINE_MODEL_BASE_URL (defaults per provider, loopback only)
 *   ORG_ENGINE_MODEL_NAME
 */
import { FastifyInstance } from 'fastify';
import { request as httpReq } from 'node:http';
import { URL } from 'node:url';

export type ProviderKind = 'ollama' | 'llama.cpp' | 'fake' | 'none';

export interface ProviderHealthReport {
  provider: ProviderKind;
  base_url: string;
  local_only: true;
  model: string | null;
  ok: boolean;
  detail: string;
  models_loaded: string[];
  context_length: number | null;
  json_mode: boolean;
  checked_at: string;
  /** What the user can do when ok=false — product copy, not jargon. */
  fallback_options: string[];
}

function providerFromEnv(): { kind: ProviderKind; baseUrl: string; model: string | null } {
  const kind = (process.env.ORG_ENGINE_MODEL_PROVIDER as ProviderKind) || 'none';
  const model = process.env.ORG_ENGINE_MODEL_NAME || null;
  switch (kind) {
    case 'ollama':
      return { kind, baseUrl: process.env.ORG_ENGINE_MODEL_BASE_URL || 'http://127.0.0.1:11434', model };
    case 'llama.cpp':
      return { kind, baseUrl: process.env.ORG_ENGINE_MODEL_BASE_URL || 'http://127.0.0.1:8080', model };
    case 'fake':
      return { kind, baseUrl: 'internal://fake', model: model || 'fake-mini' };
    default:
      return { kind: 'none', baseUrl: '', model };
  }
}

function fetchJson(url: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = httpReq(
      { host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET', timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: data }); }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null }); });
    req.on('error', () => resolve({ status: 0, body: null }));
    req.end();
  });
}

const FALLBACKS = [
  '本地模型未运行时，你仍然可以：',
  '· 用规则模式完成任务（不依赖模型）',
  '· 手动确认每一步操作',
  '· 取消本次任务',
];

export function registerModelRoutes(app: FastifyInstance): void {
  app.get('/api/v1/personal/model/health', async () => {
    const { kind, baseUrl, model } = providerFromEnv();
    const report: ProviderHealthReport = {
      provider: kind,
      base_url: baseUrl,
      local_only: true,
      model,
      ok: false,
      detail: '',
      models_loaded: [],
      context_length: null,
      json_mode: kind !== 'llama.cpp' && kind !== 'none',
      checked_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      fallback_options: FALLBACKS,
    };

    if (kind === 'none') {
      report.detail = '未配置本地模型。当前只能使用规则模式和手动模式。';
      report.fallback_options = ['在设置中导入本地模型配置（Ollama 或 llama.cpp）。'];
      return report;
    }
    if (kind === 'fake') {
      report.ok = true;
      report.detail = '测试模式（fake provider）已就绪 — 仅用于开发。';
      report.models_loaded = [report.model ?? 'fake-mini'];
      report.context_length = 8192;
      return report;
    }

    if (kind === 'ollama') {
      const { status, body } = await fetchJson(`${baseUrl}/api/tags`, 3000);
      if (status === 0) {
        report.detail = `无法连接 Ollama（${baseUrl}）。请确认 Ollama 正在运行。`;
        return report;
      }
      if (status !== 200 || typeof body !== 'object' || body === null) {
        report.detail = `Ollama 返回异常（HTTP ${status}）。`;
        return report;
      }
      report.ok = true;
      report.models_loaded = ((body as any).models ?? []).map((m: any) => m.name);
      if (model && report.models_loaded.length && !report.models_loaded.some((n) => n.startsWith(model))) {
        report.ok = false;
        report.detail = `Ollama 正在运行，但模型 ${model} 未加载。已加载：${report.models_loaded.join(', ') || '无'}。`;
        return report;
      }
      report.detail = 'Ollama 已就绪。';
      const shown = await fetchJson(`${baseUrl}/api/show`, 3000); // note: /show is POST; skip failures
      if (shown.status === 200 && typeof shown.body === 'object' && shown.body !== null) {
        const ctx = (shown.body as any).model_info?.general?.context_length;
        if (typeof ctx === 'number') report.context_length = ctx;
      }
      return report;
    }

    // llama.cpp
    const { status } = await fetchJson(`${baseUrl}/health`, 3000);
    if (status === 0) {
      report.detail = `无法连接 llama.cpp server（${baseUrl}）。请确认 llama-server 正在运行。`;
      return report;
    }
    if (status === 503) {
      report.detail = 'llama.cpp 正在加载模型，请稍候。';
      return report;
    }
    if (status === 200) {
      report.ok = true;
      report.detail = 'llama.cpp 已就绪。';
      report.models_loaded = model ? [model] : ['local'];
      const props = await fetchJson(`${baseUrl}/props`, 3000);
      if (props.status === 200 && typeof props.body === 'object' && props.body !== null) {
        const ctx = (props.body as any).default_generation_settings?.n_ctx;
        if (typeof ctx === 'number') report.context_length = ctx;
      }
      return report;
    }
    report.detail = `llama.cpp 返回异常（HTTP ${status}）。`;
    return report;
  });
}
