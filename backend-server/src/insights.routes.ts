// insights.routes.ts
// 治理洞察查询端点：会议记录 / 通信审计 / 产物注册表。
// 数据来自引擎运行时落盘的状态文件（~/.org-engine-editor/state/）：
//   meetings.jsonl / comm.jsonl / products.json
import { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Insights {
  meetings: unknown[];
  comm: unknown[];
  products: unknown[];
}

export function readInsights(stateDir: string): Insights {
  const out: Insights = { meetings: [], comm: [], products: [] };
  if (!existsSync(stateDir)) return out;

  // JSONL 行式文件：meetings / comm（容错损坏行）
  const jsonl = (file: string): unknown[] => {
    const p = join(stateDir, file);
    if (!existsSync(p)) return [];
    return readFileSync(p, 'utf-8')
      .split('\n')
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter((x): x is unknown => x !== null);
  };

  out.meetings = jsonl('meetings.jsonl');
  out.comm = jsonl('comm.jsonl');

  const pp = join(stateDir, 'products.json');
  if (existsSync(pp)) {
    try { out.products = JSON.parse(readFileSync(pp, 'utf-8')); } catch { /* empty/corrupt */ }
  }
  return out;
}

export function registerInsightsRoutes(app: FastifyInstance, stateDir: string): void {
  app.get('/api/v1/insights', async () => readInsights(stateDir));
  app.get('/api/v1/insights/meetings', async () => readInsights(stateDir).meetings);
  app.get('/api/v1/insights/comm', async () => readInsights(stateDir).comm);
  app.get('/api/v1/insights/products', async () => readInsights(stateDir).products);
}
