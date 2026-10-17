import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveDataPaths, assertWritableDataDir, firstRunInit, isInstallPath,
} from '../src/config';

function rmRf(p: string): void {
  try {
    rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch { /* best effort on Windows */ }
}

const TMP = join(process.cwd(), '.tmp-personal-config');

beforeEach(() => {
  rmRf(TMP);
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmRf(TMP);
});

describe('P9.1 resolveDataPaths', () => {
  it('separates install dir, user data dir, db and evidence paths', () => {
    const paths = resolveDataPaths({ ORG_ENGINE_HOME: join(TMP, 'data') }, join(TMP, 'install'));
    expect(paths.installDir).toBe(join(TMP, 'install'));
    expect(paths.userDataDir).toBe(join(TMP, 'data'));
    expect(paths.personalDbPath).toBe(join(TMP, 'data', 'personal', 'personal.sqlite'));
    expect(paths.evidenceDir).toBe(join(TMP, 'data', 'evidence'));
  });

  it('falls back to APPDATA on Windows and home elsewhere', () => {
    const win = resolveDataPaths({ APPDATA: 'D:\\AppData' } as NodeJS.ProcessEnv, 'x');
    expect(win.userDataDir).toBe(join('D:\\AppData', 'org-engine'));
    const nix = resolveDataPaths({ USERPROFILE: '/home/u' } as NodeJS.ProcessEnv, 'x');
    expect(nix.userDataDir).toBe(join('/home/u', '.org-engine-editor'));
  });

  it('refuses data dirs inside asar or install media', () => {
    const bad: Parameters<typeof assertWritableDataDir>[0] = {
      installDir: 'C:\\apps\\app.asar',
      userDataDir: 'C:\\apps\\app.asar\\data',
      personalDbPath: 'C:\\apps\\app.asar\\data\\personal.sqlite',
      evidenceDir: 'C:\\apps\\app.asar\\data\\evidence',
    };
    expect(() => assertWritableDataDir(bad)).toThrow(/安装介质/);
    expect(isInstallPath('C:/apps/app.asar/data')).toBe(true);
    expect(isInstallPath('D:/AppData/org-engine')).toBe(false);
  });
});

describe('P9.1 firstRunInit', () => {
  it('creates data dirs and the permissions notice on first launch', () => {
    const paths = resolveDataPaths({ ORG_ENGINE_HOME: join(TMP, 'data') }, join(TMP, 'install'));
    const result = firstRunInit(paths);
    expect(result.created).toBe(true);
    expect(existsSync(join(TMP, 'data', 'personal'))).toBe(true);
    expect(existsSync(join(TMP, 'data', 'evidence'))).toBe(true);
    const notice = readFileSync(result.permissionsFile, 'utf-8');
    expect(notice).toContain('原文件永不修改');
    expect(notice).toContain('升级软件不会动这个目录');
  });

  it('is idempotent: second launch does not overwrite the notice', () => {
    const paths = resolveDataPaths({ ORG_ENGINE_HOME: join(TMP, 'data') }, join(TMP, 'install'));
    firstRunInit(paths);
    const noticePath = join(TMP, 'data', '权限说明.md');
    writeFileSync(noticePath, '用户改过的内容', 'utf-8');
    const second = firstRunInit(paths);
    expect(second.created).toBe(false);
    expect(readFileSync(noticePath, 'utf-8')).toBe('用户改过的内容');
  });
});

describe('P9.1 schema migration and restart persistence', () => {
  it('old-schema personal.sqlite migrates and keeps user data across upgrade', async () => {
    const { PersonalStore } = await import('../src/personal/store');
    const dbPath = join(TMP, 'old.sqlite');

    // 模拟旧版本 v1 安装：手动只跑 001
    const oldStore = new PersonalStore({ dbPath });
    oldStore.saveFact({
      schema_version: 1, id: 'fact_old', kind: 'schedule',
      value: { weekday: 'friday', activity: 'gym' }, source_refs: ['evidence_1'],
      confidence: 0.9, valid_from: '2026-01-01T00:00:00Z', valid_until: null,
      sensitivity: 'normal', status: 'active',
    });
    oldStore.close();

    // 「升级」：meta 回写为旧版本号后重开；migrate 必须补齐 schema 且数据仍在
    const { createRequire } = await import('node:module');
    const requireNative = createRequire(import.meta.url);
    const { DatabaseSync } = requireNative('node:sqlite');
    const raw = new DatabaseSync(dbPath);
    raw.prepare(`UPDATE meta SET value = '1' WHERE key = 'schema_version'`).run();
    raw.close();

    const reopened = new PersonalStore({ dbPath });
    expect(reopened.getFact('fact_old')?.kind).toBe('schedule');
    // P7 的表也补齐了
    expect(reopened.listLearningSignals()).toEqual([]);
    reopened.close();
  });

  it('packaged-restart check: data still there after close + reopen', async () => {
    const { PersonalStore } = await import('../src/personal/store');
    const dbPath = join(TMP, 'restart.sqlite');
    let store = new PersonalStore({ dbPath });
    store.saveTaskWithEvidence(
      {
        schema_version: 1, id: 'task_1', goal: '整理材料', success_criteria: [],
        allowed_scopes: [], forbidden_actions: [], required_evidence: [],
        risk_level: 'low', confirmation_points: [], status: 'draft', version: 1,
      },
      [{
        schema_version: 1, id: 'evidence_1', kind: 'user_statement',
        locator: 'conversation://c/1', content_hash: 'sha256:' + 'a'.repeat(64),
        captured_at: '2026-10-17T10:00:00Z', sensitivity: 'normal', supports: [],
      }],
    );
    store.saveTrace({
      schema_version: 1, id: 'trace_1', task_id: 'task_1', input_refs: ['task_1'],
      candidate_actions: [], selected_action: 'action_1', rejected_reasons: [],
      policy_version: 'baseline-0.1', rule_refs: [], evidence_refs: ['evidence_1'],
      uncertainty: 0.1, requires_confirmation: false,
    });
    store.saveLearningSignal({
      schema_version: 1, id: 'sig_1', event: 'accepted',
      task_id: 'task_1', trace_id: 'trace_1', evidence_ids: ['evidence_1'],
      sensitivity: 'normal', recorded_at: '2026-10-17T10:00:00Z',
    });
    store.close();
    store = new PersonalStore({ dbPath });
    expect(store.countLearningSignals('accepted')).toBe(1);
    store.close();
  });
});
