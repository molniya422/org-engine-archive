/**
 * Python personal service 的统一 HTTP 客户端。
 *
 * 事实基线：service.py 是 stdlib http.server，只绑 127.0.0.1，无认证。
 * 因此这里只允许 loopback，且必须给每个请求明确的超时——本地模型单回合
 * 可能跑十几分钟，超时值由调用方按场景传入，不设全局默认。
 */
import { request as httpRequest } from 'node:http';
import type { EvalExecutor } from './eval.routes';
import type { ReplayExecutor } from './replay.routes';
import type { SimulateExecutor } from './simulation.routes';

export interface ServiceClientOptions {
  baseUrl: string;
  /** 单次请求最多等待多久（毫秒）。执行类调用由调用方给 35 分钟。 */
  timeoutMs: number;
}

export class ServiceUnavailableError extends Error {
  constructor(message: string, readonly detail = '') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

export class ServiceRejectedError extends Error {
  constructor(message: string, readonly status: number, readonly payload: unknown) {
    super(message);
    this.name = 'ServiceRejectedError';
  }
}

/** 把底层错误（含 undici 的 cause）压成一行，避免丢失原始原因。 */
function describeError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as { cause?: unknown }).cause;
  return cause instanceof Error ? `${e.message}; cause: ${cause.message}` : e.message;
}

export function assertLoopbackServiceUrl(baseUrl: string): void {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new ServiceUnavailableError(`invalid personal service url: ${baseUrl}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new ServiceUnavailableError(
      `refusing non-http personal service: ${baseUrl}`,
    );
  }
  // URL.hostname 对 IPv6 保留方括号（[::1]），比较前先剥掉。
  const host = (u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new ServiceUnavailableError(
      `refusing non-loopback personal service: ${baseUrl}`,
    );
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 200 但结构不对：按链路故障处理，绝不把空响应当成成功。 */
function malformed(path: string, detail: string): ServiceUnavailableError {
  return new ServiceUnavailableError(
    `malformed response from personal service (${path}): ${detail}`,
  );
}

export async function callService<T>(
  opts: ServiceClientOptions,
  path: string,
  body: unknown,
): Promise<T> {
  assertLoopbackServiceUrl(opts.baseUrl);
  // 尾斜杠会拼出 //v1/eval，Python 侧精确比较 path 会 404。
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const payload = JSON.stringify(body);

  // 必须用 node:http 而不是 fetch。
  //
  // 实测（2026-10-24）：Python service 要等整个 execute 跑完才写响应头，
  // 而 Node 内置 fetch（undici）有 **300 秒的 headersTimeout 硬限制**，
  // AbortSignal.timeout 无法覆盖它。本地模型一个 turn 要 25+ 分钟，
  // 于是必然抛 "Headers Timeout Error"，把成功执行误判成 recoverable。
  //
  // node:http 的 timeout 是 socket 空闲超时，不会在等待响应头时提前断开。
  const result = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const u = new URL(`${baseUrl}${path}`);
    const req = httpRequest(
      {
        host: u.hostname,
        port: u.port || 80,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          text: Buffer.concat(chunks).toString('utf8'),
        }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error(`personal service timeout after ${opts.timeoutMs}ms (${path})`));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  }).catch((e: unknown) => {
    throw new ServiceUnavailableError(
      `personal service request failed (${path})`,
      describeError(e),
    );
  });

  let data: unknown = {};
  try {
    data = result.text ? JSON.parse(result.text) : {};
  } catch {
    data = { raw: result.text.slice(0, 500) };
  }
  if (result.status < 200 || result.status >= 300) {
    const reason = isRecord(data) && typeof data.error === 'string' ? `: ${data.error}` : '';
    throw new ServiceRejectedError(
      `personal service ${path} -> HTTP ${result.status}${reason}`,
      result.status,
      data,
    );
  }
  return data as T;
}

/**
 * 把 TS 侧的执行器接口映射到 Python service。
 * 注意：Python 侧 `/v1/eval` 等端点在后续 Task 才实现；在那之前这些路由
 * 会返回 5xx 并在 body 里带错误——不会假装成功。
 */
export function serviceExecutorAdapters(baseUrl: string) {
  const evalExecutor: EvalExecutor = {
    async run(cases, outcomes) {
      const out = await callService<{ report?: unknown } | null>(
        { baseUrl, timeoutMs: 60_000 },
        '/v1/eval',
        { cases, outcomes },
      );
      const report = out?.report;
      if (!isRecord(report)) throw malformed('/v1/eval', 'report must be an object');
      return report;
    },
  };

  const replayExecutor: ReplayExecutor = {
    async replay(record, fromStep) {
      const out = await callService<{ events?: unknown } | null>(
        { baseUrl, timeoutMs: 60_000 },
        '/v1/replay',
        { record, from_step: fromStep },
      );
      const events = out?.events;
      if (!Array.isArray(events)) throw malformed('/v1/replay', 'events must be an array');
      return events as Array<Record<string, unknown>>;
    },
    async compare(oldR, newR) {
      const out = await callService<{ diff?: unknown } | null>(
        { baseUrl, timeoutMs: 60_000 },
        '/v1/replay/compare',
        { old: oldR, new: newR },
      );
      const diff = out?.diff;
      if (!isRecord(diff)) throw malformed('/v1/replay/compare', 'diff must be an object');
      return diff;
    },
  };

  const simulate: SimulateExecutor = async (contract, calls) => {
    const out = await callService<{ simulation?: unknown } | null>(
      { baseUrl, timeoutMs: 60_000 },
      '/v1/simulate',
      { contract, calls },
    );
    const simulation = out?.simulation;
    if (!isRecord(simulation)) throw malformed('/v1/simulate', 'simulation must be an object');
    return simulation;
  };

  return { eval: evalExecutor, replay: replayExecutor, simulate };
}
