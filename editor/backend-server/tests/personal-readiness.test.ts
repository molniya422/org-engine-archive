import { describe, it, expect, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { checkReadiness } from '../src/personal/route-guard';

const TMP = join(process.cwd(), '.tmp-readiness');
mkdirSync(TMP, { recursive: true });

async function stub(status: number, body: unknown) {
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

describe('readiness guard', () => {
  it('reports not_ready when personal service is down', async () => {
    const r = await checkReadiness({ serviceUrl: 'http://127.0.0.1:1', octop: null });
    expect(r.ready).toBe(false);
    expect(r.checks.personal_service.ok).toBe(false);
    expect(r.reason).toMatch(/personal_service/);
  });

  it('reports not_ready when octop is not configured', async () => {
    const svc = await stub(200, { ok: true });
    const r = await checkReadiness({ serviceUrl: svc.url, octop: null });
    expect(r.ready).toBe(false);
    expect(r.checks.octop.ok).toBe(false);
    expect(r.checks.octop.detail).toMatch(/OCTOP_/);
    svc.close();
  });

  it('reports not_ready when workspace does not exist', async () => {
    const svc = await stub(200, { ok: true });
    const octop = await stub(200, { ok: true, db: true });
    const r = await checkReadiness({
      serviceUrl: svc.url,
      octop: {
        base_url: octop.url, username: 'admin', password: 'x',
        agent_name: 'personal', workspace_root: join(TMP, 'does-not-exist'),
      },
    });
    expect(r.ready).toBe(false);
    expect(r.checks.workspace.ok).toBe(false);
    svc.close(); octop.close();
  });

  it('reports ready when everything is up', async () => {
    const svc = await stub(200, { ok: true });
    const octop = await stub(200, { ok: true, db: true });
    const r = await checkReadiness({
      serviceUrl: svc.url,
      octop: {
        base_url: octop.url, username: 'admin', password: 'x',
        agent_name: 'personal', workspace_root: TMP,
      },
    });
    expect(r.checks.personal_service.ok).toBe(true);
    expect(r.checks.octop.ok).toBe(true);
    expect(r.checks.workspace.ok).toBe(true);
    expect(r.ready).toBe(true);
    svc.close(); octop.close();
  });

  it('always returns exactly the three named checks', async () => {
    const r = await checkReadiness({ serviceUrl: 'http://127.0.0.1:1', octop: null });
    expect(Object.keys(r.checks).sort()).toEqual(['octop', 'personal_service', 'workspace']);
  });

  it('lists every failing check name in reason', async () => {
    const r = await checkReadiness({ serviceUrl: 'http://127.0.0.1:1', octop: null });
    expect(r.reason).toContain('personal_service');
    expect(r.reason).toContain('octop');
  });
});

afterAll(() => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* windows */ } });
