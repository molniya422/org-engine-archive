/**
 * P7.3 (TS side) — learning proposal → version HTTP surface.
 *
 * 提案生命周期：proposed → approved（批准，生成 applied 版本）→
 * applied（回归通过后启用版本）→ reverted（回滚，恢复旧版本）。
 * 三个关键状态持久化在 personal.sqlite 中，刷新和重启后保持一致（验收）。
 *
 * 路由本身不做回归判定——apply 时必须带上 eval runner 的结论；eval_passed
 * 为 false 时拒绝启用并返回 409，版本停在 applied。
 */
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { PersonalStore } from './store';
import { PersonalValidationError } from './store';

export const LEARNING_VERSION_KINDS = ['facts', 'rules', 'policy', 'prompts'] as const;
export type LearningVersionKind = (typeof LEARNING_VERSION_KINDS)[number];

const PROPOSAL_STATUSES = ['proposed', 'approved', 'applied', 'rejected', 'reverted'] as const;

export interface LearningRoutesOptions {
  store: PersonalStore;
}

interface VersionRow {
  version_id: string;
  kind: LearningVersionKind;
  seq: number;
  content: Record<string, unknown>;
  proposal_id: string;
  status: 'applied' | 'enabled' | 'superseded' | 'rolled_back';
  eval_report: string;
}

function nextSeq(versions: VersionRow[], kind: LearningVersionKind): number {
  return versions.filter((v) => v.kind === kind).length + 1;
}

export function registerLearningRoutes(app: FastifyInstance, opts: LearningRoutesOptions): void {
  const { store } = opts;

  // -- read ---------------------------------------------------------------

  app.get('/api/v1/personal/learning/proposals', async () => {
    return { proposals: store.listLearningProposals() };
  });

  app.get('/api/v1/personal/learning/versions', async (req) => {
    const { kind } = req.query as { kind?: LearningVersionKind };
    return { versions: store.listLearningVersions(kind) };
  });

  // -- approve：提案 → approved，同时生成 immutable version（applied，未启用）--

  app.post<{ Params: { id: string }; Body: { kind?: LearningVersionKind; content?: Record<string, unknown>; version_id?: string } }>(
    '/api/v1/personal/learning/proposals/:id/approve',
    async (req, reply) => {
      const { id } = req.params;
      const proposal = store.getLearningProposal(id);
      if (!proposal) {
        reply.code(404);
        return { error: `proposal not found: ${id}` };
      }
      const kind = req.body?.kind;
      if (!kind || !LEARNING_VERSION_KINDS.includes(kind)) {
        reply.code(400);
        return { error: `kind must be one of ${LEARNING_VERSION_KINDS.join('/')}` };
      }
      if (String(proposal['status']) === 'approved') {
        reply.code(409);
        return { error: 'proposal already approved' };
      }
      const versions = store.listLearningVersions(kind) as unknown as VersionRow[];
      const versionId = req.body?.version_id ?? `ver_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      store.saveLearningVersion({
        version_id: versionId,
        kind,
        seq: nextSeq(versions, kind),
        content: req.body?.content ?? (proposal['rule'] as Record<string, unknown>) ?? {},
        proposal_id: id,
        status: 'applied',
        eval_report: '',
      });
      store.saveLearningProposal({ ...proposal, id, status: 'approved' });
      store.audit('user', 'learning.approve', 'learning', id, { version_id: versionId, kind });
      return { proposal_id: id, status: 'approved', version_id: versionId };
    },
  );

  // -- apply：approved → applied；版本启用前必须回归通过 --------------------

  app.post<{ Params: { id: string }; Body: { eval_passed?: boolean; eval_report?: string } }>(
    '/api/v1/personal/learning/proposals/:id/apply',
    async (req, reply) => {
      const { id } = req.params;
      const proposal = store.getLearningProposal(id);
      if (!proposal) {
        reply.code(404);
        return { error: `proposal not found: ${id}` };
      }
      if (String(proposal['status']) !== 'approved') {
        reply.code(409);
        return { error: `proposal must be approved before apply, current: ${proposal['status']}` };
      }
      const versions = store.listLearningVersions() as unknown as VersionRow[];
      const version = versions.find((v) => v.proposal_id === id && v.status === 'applied');
      if (!version) {
        reply.code(409);
        return { error: 'no applied version found for this proposal' };
      }
      if (req.body?.eval_passed !== true) {
        reply.code(409);
        return { error: '回归集通过后才允许启用', eval_report: req.body?.eval_report ?? 'eval not run' };
      }
      store.saveLearningVersion({
        ...version,
        content: undefined,
        status: 'enabled',
        eval_report: req.body?.eval_report ?? 'passed',
      });
      // 被替代的旧启用版本标记 superseded
      for (const v of versions) {
        if (v.kind === version.kind && v.status === 'enabled' && v.version_id !== version.version_id) {
          store.saveLearningVersion({ ...v, content: undefined, status: 'superseded' });
        }
      }
      store.saveLearningProposal({ ...proposal, id, status: 'applied' });
      store.audit('user', 'learning.apply', 'learning', id, { version_id: version.version_id });
      return { proposal_id: id, status: 'applied', version_id: version.version_id };
    },
  );

  // -- rollback：applied → reverted；恢复旧版本并保留审计 ------------------

  app.post<{ Params: { id: string } }>(
    '/api/v1/personal/learning/proposals/:id/rollback',
    async (req, reply) => {
      const { id } = req.params;
      const proposal = store.getLearningProposal(id);
      if (!proposal) {
        reply.code(404);
        return { error: `proposal not found: ${id}` };
      }
      if (String(proposal['status']) !== 'applied') {
        reply.code(409);
        return { error: `only an applied proposal can be rolled back, current: ${proposal['status']}` };
      }
      const versions = store.listLearningVersions() as unknown as VersionRow[];
      const current = versions.find((v) => v.proposal_id === id && v.status === 'enabled');
      if (!current) {
        reply.code(409);
        return { error: 'no enabled version found for this proposal' };
      }
      const prior = versions
        .filter((v) => v.kind === current.kind && v.version_id !== current.version_id
          && (v.status === 'superseded' || v.status === 'rolled_back'))
        .sort((a, b) => b.seq - a.seq)[0];
      if (!prior) {
        reply.code(409);
        return { error: 'no previous version to restore' };
      }
      store.saveLearningVersion({ ...current, content: undefined, status: 'rolled_back' });
      store.saveLearningVersion({ ...prior, content: undefined, status: 'enabled' });
      store.saveLearningProposal({ ...proposal, id, status: 'reverted' });
      store.audit('user', 'learning.rollback', 'learning', id, {
        rolled_back: current.version_id, restored: prior.version_id,
      });
      return {
        proposal_id: id, status: 'reverted',
        rolled_back: current.version_id, restored: prior.version_id,
      };
    },
  );

  // -- reject：拒绝提案，不影响任务 -----------------------------------------

  app.post<{ Params: { id: string } }>(
    '/api/v1/personal/learning/proposals/:id/reject',
    async (req, reply) => {
      const { id } = req.params;
      const proposal = store.getLearningProposal(id);
      if (!proposal) {
        reply.code(404);
        return { error: `proposal not found: ${id}` };
      }
      store.saveLearningProposal({ ...proposal, id, status: 'rejected' });
      store.audit('user', 'learning.reject', 'learning', id, {});
      return { proposal_id: id, status: 'rejected' };
    },
  );
}

// Re-export so consumers can narrow errors without importing store directly.
export { PersonalValidationError, PROPOSAL_STATUSES };
