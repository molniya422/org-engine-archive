/**
 * 守卫测试：personal 的每个路由模块都必须在 server.ts 里被真正注册。
 * 历史上 7 个模块写好了、有单测、却从未 import——本测试防止再次发生。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER = readFileSync(join(process.cwd(), 'src', 'server.ts'), 'utf-8');

const REQUIRED_REGISTRATIONS = [
  'registerEvalRoutes',
  'registerReplayRoutes',
  'registerSimulationRoutes',
  'registerRuleEngineRoutes',
  'registerModelRoutes',
  'registerLearningRoutes',
  'registerSettingsRoutes',
] as const;

describe('personal route modules are mounted', () => {
  for (const name of REQUIRED_REGISTRATIONS) {
    it(`${name} is imported and called in server.ts`, () => {
      const occurrences = SERVER.split(name).length - 1;
      // 1 = import, 1 = call site
      expect(occurrences, `${name} appears ${occurrences} times`).toBeGreaterThanOrEqual(2);
    });
  }

  it('registerPersonalRoutes and registerPipelineRoutes are still mounted', () => {
    expect(SERVER).toContain('registerPersonalRoutes(app');
    expect(SERVER).toContain('registerPipelineRoutes(app');
  });

  it('exposes the readiness endpoint backed by the real guard', () => {
    expect(SERVER).toContain("app.get('/api/v1/personal/readiness'");
    expect(SERVER).toContain('checkReadiness');
  });
});
