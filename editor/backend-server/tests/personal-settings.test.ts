import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import { PersonalStore } from '../src/personal/store';
import { registerSettingsRoutes } from '../src/personal/settings.routes';

const TMP = join(process.cwd(), '.tmp-personal-settings');

function rmRf(p: string): void {
  try { rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* windows */ }
}

function build() {
  const store = new PersonalStore({ dbPath: join(TMP, 'personal.sqlite') });
  const app = Fastify({ logger: false });
  registerSettingsRoutes(app, { store });
  return { app, store };
}

beforeEach(() => { rmRf(TMP); mkdirSync(TMP, { recursive: true }); });
afterAll(() => rmRf(TMP));

const SETTINGS = {
  workspace: 'D:/我的资料',
  model: 'local',
  privacy: 'local_only',
  permissions: ['read_only', 'create_draft'],
};

describe('personal settings', () => {
  it('returns defaults before anything is saved', async () => {
    const { app, store } = build();
    const res = await app.inject({ method: 'GET', url: '/api/v1/personal/settings' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.settings.model).toBe('local');
    expect(body.settings.permissions).toEqual(['read_only']);
    expect(body.version).toBe(1);
    store.close();
  });

  it('persists onboarding choices and bumps version', async () => {
    const { app, store } = build();
    const put = await app.inject({
      method: 'PUT', url: '/api/v1/personal/settings', payload: SETTINGS,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().version).toBe(1);

    const get = await app.inject({ method: 'GET', url: '/api/v1/personal/settings' });
    expect(get.json().settings.workspace).toBe('D:/我的资料');
    expect(get.json().settings.permissions).toContain('create_draft');

    // 再次保存（用户改设置）：版本必须递增，否则无法判断设置是否被改动。
    const put2 = await app.inject({
      method: 'PUT', url: '/api/v1/personal/settings',
      payload: { ...SETTINGS, permissions: ['read_only'] },
    });
    expect(put2.json().version).toBe(2);
    const get2 = await app.inject({ method: 'GET', url: '/api/v1/personal/settings' });
    expect(get2.json().version).toBe(2);
    expect(get2.json().settings.permissions).toEqual(['read_only']);
    store.close();
  });

  it('rejects an unknown model value', async () => {
    const { app, store } = build();
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/personal/settings',
      payload: { ...SETTINGS, model: 'gpt-9' },
    });
    expect(res.statusCode).toBe(400);
    store.close();
  });

  it('rejects an unknown permission', async () => {
    const { app, store } = build();
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/personal/settings',
      payload: { ...SETTINGS, permissions: ['read_only', 'delete_everything'] },
    });
    expect(res.statusCode).toBe(400);
    store.close();
  });

  it('settings survive a store reopen (restart)', async () => {
    const first = build();
    await first.app.inject({ method: 'PUT', url: '/api/v1/personal/settings', payload: SETTINGS });
    first.store.close();

    const second = build();
    const res = await second.app.inject({ method: 'GET', url: '/api/v1/personal/settings' });
    expect(res.json().settings.workspace).toBe('D:/我的资料');
    second.store.close();
  });
});
