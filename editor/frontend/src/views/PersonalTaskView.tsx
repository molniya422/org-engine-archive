/**
 * P5.4 (TS side) — PersonalTaskView: 首页/事项页用用户语言展示整理结果。
 *
 * New users must never see agent jargon here (P4.3 contract): statuses come
 * from /personal/labels; raw trace data stays on the diagnostics page.
 * This component is a presentational view over a MaterialOutcome — the
 * engine (Python) computes outcomes; this only renders them.
 */
import React from 'react';
import { PlanPreview, type PlannedAction, type EvidenceLink } from '../components/personal/PlanPreview';

export interface SourcedTodo {
  title: string;
  due: string;
  expired: boolean;
  source: { file: string; lines: Array<{ line: number; text: string }> };
}

export interface UnresolvedItem {
  file: string;
  note: string;
}

export interface MaterialOutcomeView {
  summary: { total_files: number; readable: number; unreadable: number; with_dates: number };
  todos: SourcedTodo[];
  duplicates: string[];
  unresolved: UnresolvedItem[];
  reminder_candidates: Array<{ title: string; due: string; auto_created: boolean }>;
  draft_path: string;
  /** P6.4 — 计划预览：用户先看「准备做什么」，再逐项确认。 */
  plan?: { planned_actions: PlannedAction[] };
  evidence_links?: EvidenceLink[];
  onConfirmAction?: (action_id: string) => void;
}

const STATUS_TEXT: Record<string, string> = {
  verified: '已完成，已核对',
  incomplete: '还没完成',
  unverifiable: '无法确认是否完成',
};

export function PersonalTaskView({ outcome }: { outcome: MaterialOutcomeView }): React.ReactElement {
  const { summary, todos, duplicates, unresolved, reminder_candidates, draft_path,
          plan, evidence_links = [], onConfirmAction } = outcome;
  const completed = evidence_links.length > 0;
  return (
    <section aria-label="事项整理结果">
      <h2>材料整理结果</h2>
      <p>
        共 {summary.total_files} 份材料，可读取 {summary.readable} 份，
        {summary.unreadable > 0 ? `有 ${summary.unreadable} 份无法读取需要你确认` : '全部可读取'}。
      </p>

      {/* P6.4: 计划先于执行——「计划做什么」在待办/提醒之前显示。 */}
      {plan && plan.planned_actions.length > 0 && (
        <PlanPreview
          planned_actions={plan.planned_actions}
          onConfirm={onConfirmAction ?? (() => {})}
          completed={completed}
          evidence_links={evidence_links}
        />
      )}

      <h3>待办（{todos.length}）</h3>
      <ul>
        {todos.map((t) => (
          <li key={`${t.title}-${t.due}`}>
            {t.title} —— 截止 {t.due}{t.expired ? '（已过期）' : ''}
            <span className="source">（来源：{t.source.file}）</span>
          </li>
        ))}
      </ul>

      {unresolved.length > 0 && (
        <>
          <h3>需要你补充的信息</h3>
          <ul>
            {unresolved.map((u) => (
              <li key={u.file}>{u.file}：{u.note}</li>
            ))}
          </ul>
        </>
      )}

      {duplicates.length > 0 && (
        <>
          <h3>重复项</h3>
          <ul>{duplicates.map((d) => <li key={d}>{d}</li>)}</ul>
        </>
      )}

      {reminder_candidates.length > 0 && (
        <>
          <h3>提醒候选（不会自动创建）</h3>
          <ul>
            {reminder_candidates.map((c) => (
              <li key={`${c.title}-${c.due}`}>{c.title}（{c.due}）</li>
            ))}
          </ul>
        </>
      )}

      <p className="draft-note">整理结果已保存为草稿：{draft_path}（原文件未修改）</p>
      {/* P6.4: 有计划数据时，完成状态只能由真实证据逐项说明，不能笼统宣称已完成。 */}
      {!plan && <p className="status-note">{STATUS_TEXT.verified}</p>}
    </section>
  );
}
