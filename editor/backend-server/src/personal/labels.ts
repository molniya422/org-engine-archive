/**
 * P4.3 — user-facing labels for internal concepts.
 *
 * New users looking at the home / tasks views must never need to understand
 * agent terminology. Internal role / department / gateway / route names map
 * to plain-language Chinese labels ("整理、检查、需要你确认"); the original
 * trace terms stay available on the advanced diagnostics page only.
 */

/** User-facing label for internal role names. */
const ROLE_LABELS: Record<string, string> = {
  ceo: '负责人',
  manager: '协调人',
  worker: '帮手',
  reviewer: '检查员',
  gateway: '传递站',
  secretary: '记录员',
};

/** User-facing label for internal route kinds (P4.2 execution router). */
const ROUTE_LABELS: Record<string, string> = {
  simple: '直接整理',
  review: '先整理，再检查',
  parallel: '多人协作整理',
};

/** User-facing status phrases — what the user is asked to do, not how it works. */
const STATUS_LABELS: Record<string, string> = {
  select: '可以直接做',
  ask_user: '需要你补充信息',
  needs_confirmation: '需要你确认',
  blocked: '按你的规则不执行',
  policy_error: '暂时拿不准，先不做',
  verified: '已完成，已核对',
  incomplete: '还没完成',
  unverifiable: '无法确认是否完成',
  failed: '没有做成',
};

const HIGH_RISK_KIND_LABELS: Record<string, string> = {
  external_send: '对外发送',
  delete: '删除',
  submit: '提交',
  payment: '付款',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role.toLowerCase()] ?? role;
}

export function routeLabel(route: string): string {
  return ROUTE_LABELS[route] ?? route;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function actionKindLabel(kind: string): string {
  return HIGH_RISK_KIND_LABELS[kind] ?? kind;
}

/** True when the string still contains internal jargon that must not reach
 *  the home/tasks views. Used by a test to pin the no-jargon guarantee. */
const JARGON = ['agent', 'orchestrator', 'gateway', 'role', 'department', 'policy', 'envelope'];

export function exposesJargon(text: string): boolean {
  const lower = text.toLowerCase();
  return JARGON.some((j) => lower.includes(j));
}
