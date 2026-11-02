/**
 * 启动就绪检查：在接任务之前确认依赖真的可用。
 *
 * 三个检查项：personal service / Octop / workspace。
 * 任何一项失败都返回 ready:false 并给出可读原因——绝不"启动了但用不了"。
 */
import { existsSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';
import type { OctopConfig } from './pipeline.routes';

export interface ReadinessCheck {
  ok: boolean;
  detail: string;
}

export interface ReadinessReport {
  ready: boolean;
  checks: {
    personal_service: ReadinessCheck;
    octop: ReadinessCheck;
    workspace: ReadinessCheck;
  };
  reason: string;
}

/**
 * GET 一个 JSON 健康端点。
 *
 * 用 node:http 而不是 fetch：实测（2026-10-24）同一台机器上
 * `fetch` 访问 127.0.0.1:8088 报 "fetch failed"，而 curl 和 node:http
 * 都是 5-14ms 正常返回。Node 内置 fetch（undici）在本地回环上有已知的
 * 连接复用问题，长任务场景更明显（详见 service-client.ts 的 D4 修复）。
 */
function probe(url: string, timeoutMs = 3000): Promise<ReadinessCheck> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: ReadinessCheck) => {
      if (!settled) { settled = true; resolve(r); }
    };
    try {
      const u = new URL(url);
      const req = httpRequest(
        {
          host: u.hostname,
          port: u.port || 80,
          path: `${u.pathname}${u.search}`,
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              done({ ok: false, detail: `HTTP ${status}` });
              return;
            }
            try {
              const body = JSON.parse(text) as Record<string, unknown>;
              if (body.ok === false) {
                done({ ok: false, detail: JSON.stringify(body).slice(0, 200) });
                return;
              }
              done({ ok: true, detail: 'ok' });
            } catch {
              done({ ok: true, detail: 'ok' });  // 非 JSON 但 2xx：视为可达
            }
          });
          res.on('error', (e: Error) => done({ ok: false, detail: e.message }));
        },
      );
      req.on('timeout', () => {
        req.destroy(new Error(`timeout after ${timeoutMs}ms`));
        done({ ok: false, detail: `timeout after ${timeoutMs}ms` });
      });
      req.on('error', (e: Error) => done({ ok: false, detail: e.message }));
      req.end();
    } catch (e) {
      done({ ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  });
}

export async function checkReadiness(opts: {
  serviceUrl: string;
  octop: OctopConfig | null;
}): Promise<ReadinessReport> {
  const personal = await probe(`${opts.serviceUrl.replace(/\/+$/, '')}/health`);

  const octopCheck: ReadinessCheck = opts.octop
    ? await probe(`${opts.octop.base_url.replace(/\/+$/, '')}/api/health`)
    : {
        ok: false,
        detail: '未配置 Octop：需要设置 OCTOP_BASE_URL / OCTOP_WORKSPACE_ROOT / OCTOP_PASSWORD',
      };

  const workspaceCheck: ReadinessCheck = opts.octop
    ? {
        ok: existsSync(opts.octop.workspace_root),
        detail: existsSync(opts.octop.workspace_root)
          ? opts.octop.workspace_root
          : `工作区不存在：${opts.octop.workspace_root}`,
      }
    : { ok: false, detail: '未配置工作区' };

  const checks = { personal_service: personal, octop: octopCheck, workspace: workspaceCheck };
  const failed = Object.entries(checks).filter(([, c]) => !c.ok).map(([k]) => k);
  return {
    ready: failed.length === 0,
    checks,
    reason: failed.length === 0 ? 'ready' : `未就绪：${failed.join(', ')}`,
  };
}
