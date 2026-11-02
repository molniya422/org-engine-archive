/**
 * 个人设置：onboarding 的四个选择（工作区/模型/隐私/权限）的唯一真源。
 *
 * localStorage 只允许缓存"已完成 onboarding"这一个布尔标记；真正的设置
 * 必须落这里，否则用户选择"只读"并不会改变真实执行能力。
 */
import { FastifyInstance } from 'fastify';
import { PersonalStore, nowIso } from './store';

export type ModelChoice = 'local' | 'cloud';
export type PrivacyChoice = 'local_only' | 'local_with_model';
export type PermissionKey = 'read_only' | 'create_draft' | 'create_reminder';

export interface PersonalSettings {
  workspace: string;
  model: ModelChoice;
  privacy: PrivacyChoice;
  permissions: PermissionKey[];
}

const DEFAULT_SETTINGS: PersonalSettings = {
  workspace: '',
  model: 'local',
  privacy: 'local_only',
  permissions: ['read_only'],
};

const MODELS: ModelChoice[] = ['local', 'cloud'];
const PRIVACIES: PrivacyChoice[] = ['local_only', 'local_with_model'];
const PERMISSIONS: PermissionKey[] = ['read_only', 'create_draft', 'create_reminder'];

const SETTINGS_ID = 'personal_settings_singleton';

function validate(raw: unknown): { ok: true; value: PersonalSettings } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'settings object required' };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.workspace !== 'string') return { ok: false, error: 'workspace must be a string' };
  if (!MODELS.includes(r.model as ModelChoice)) {
    return { ok: false, error: `model must be one of ${MODELS.join('|')}` };
  }
  if (!PRIVACIES.includes(r.privacy as PrivacyChoice)) {
    return { ok: false, error: `privacy must be one of ${PRIVACIES.join('|')}` };
  }
  if (!Array.isArray(r.permissions) || !r.permissions.every((p) => PERMISSIONS.includes(p as PermissionKey))) {
    return { ok: false, error: `permissions must be a subset of ${PERMISSIONS.join('|')}` };
  }
  return {
    ok: true,
    value: {
      workspace: r.workspace,
      model: r.model as ModelChoice,
      privacy: r.privacy as PrivacyChoice,
      permissions: r.permissions as PermissionKey[],
    },
  };
}

export function registerSettingsRoutes(app: FastifyInstance, opts: { store: PersonalStore }): void {
  const { store } = opts;
  const db = (store as any).db as any;

  app.get('/api/v1/personal/settings', async () => {
    const row = db.prepare(`SELECT * FROM personal_settings WHERE id = ?`).get(SETTINGS_ID) as any;
    if (!row) return { version: 1, settings: DEFAULT_SETTINGS };
    return { version: Number(row.version), settings: JSON.parse(row.settings) };
  });

  app.put('/api/v1/personal/settings', async (req, reply) => {
    const parsed = validate(req.body);
    if (!parsed.ok) { reply.code(400); return { error: parsed.error }; }

    const existing = db.prepare(`SELECT * FROM personal_settings WHERE id = ?`).get(SETTINGS_ID) as any;
    const version = existing ? Number(existing.version) + 1 : 1;
    const at = nowIso();
    db.prepare(`
      INSERT INTO personal_settings (id, version, settings, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        version = excluded.version, settings = excluded.settings, updated_at = excluded.updated_at
    `).run(SETTINGS_ID, version, JSON.stringify(parsed.value),
      existing?.created_at ?? at, at);
    store.audit('user', 'settings.save', 'settings', SETTINGS_ID, { version });
    return { ok: true, version, settings: parsed.value };
  });
}
