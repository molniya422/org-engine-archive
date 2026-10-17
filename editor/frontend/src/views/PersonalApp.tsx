/**
 * P8.4 — PersonalApp: 个人模式（默认模式）的容器。
 *
 * 默认用户流程完全不依赖高级模式：首页 → 「我要办一件事」→ 事项页
 * （P5.4/P6.4 的 PersonalTaskView 渲染本地样例）→ 需要时才跳高级诊断。
 * 规则/记忆/隐私/学习提案页在这里挂空状态——真实数据桥接在 Phase 9。
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PersonalHomeView } from './PersonalHomeView';
import { PersonalOnboardingView } from './PersonalOnboardingView';
import { PersonalTaskView, type MaterialOutcomeView } from './PersonalTaskView';
import { PersonalRulesView } from './PersonalRulesView';
import { PersonalMemoryView } from './PersonalMemoryView';
import { PrivacyView } from './PrivacyView';
import { PersonalLearningView } from './PersonalLearningView';
import { PersonalDiagnosticsView } from './PersonalDiagnosticsView';

/** P5.2 的本地样例：首次成功任务的可运行演示，不连后端。 */
const SAMPLE_OUTCOME: MaterialOutcomeView = {
  summary: { total_files: 2, readable: 2, unreadable: 0, with_dates: 1 },
  todos: [
    {
      title: '交报销单', due: '2026-10-20', expired: false,
      source: { file: '样例/报销单.md', lines: [{ line: 3, text: '截止日期：2026-10-20' }] },
    },
  ],
  duplicates: [],
  unresolved: [],
  reminder_candidates: [],
  draft_path: 'workspace/整理汇总.md',
};

const ONBOARDING_KEY = 'personal-onboarded';

export function PersonalApp(): React.ReactElement {
  const navigate = useNavigate();
  const { tab, taskId } = useParams<{ tab?: string; taskId?: string }>();
  const [taskStarted, setTaskStarted] = React.useState(false);
  // MUA-01 前置：首次启动先走 onboarding（三个问题 + 本地样例演练），
  // 完成或跳过后落首页；标记持久化，之后不再出现。
  const [onboarded, setOnboarded] = React.useState(
    () => localStorage.getItem(ONBOARDING_KEY) === '1',
  );

  if (!onboarded && !tab && !taskId) {
    return (
      <PersonalOnboardingView
        onComplete={() => {
          localStorage.setItem(ONBOARDING_KEY, '1');
          setOnboarded(true);
        }}
      />
    );
  }

  if (tab === 'diagnostics' || taskId !== undefined) {
    return (
      <PersonalDiagnosticsView
        traces={taskStarted || taskId ? [{
          trace_id: 'trace_sample_01',
          task_id: taskId ?? 'task_sample',
          policy_version: 'baseline-0.1',
          decision: '选择「创建整理草稿」：只写新文件，风险最低',
          raw_evidence_refs: ['evidence_sample_invoice_01'],
          rule_refs: [],
        }] : []}
      />
    );
  }

  const body = (() => {
    switch (tab) {
      case 'rules':
        return <PersonalRulesView rules={[]} />;
      case 'memory':
        return <PersonalMemoryView memories={[]} />;
      case 'privacy':
        return (
          <PrivacyView
            status={{
              local_files: [{ path: 'D:\\我的资料', readable: true }],
              model: { name: '本机模型', where: '本机' },
              network: 'off',
              external_connections: [],
            }}
            dangerous_defaults={[
              { name: '对外发送', value: '默认禁止', note: '需要你逐项确认' },
              { name: '删除文件', value: '默认禁止', note: '系统不会删除你的文件' },
              { name: '付款', value: '默认禁止', note: '任何支付都不会自动发生' },
              { name: '提交', value: '默认禁止', note: '提交前必须你确认' },
            ]}
          />
        );
      case 'learning':
        return <PersonalLearningView proposals={[]} onApprove={() => {}} onReject={() => {}} />;
      default:
        if (taskStarted) {
          return (
            <div>
              <PersonalTaskView outcome={SAMPLE_OUTCOME} />
              <button onClick={() => setTaskStarted(false)}>回到首页</button>
              <button onClick={() => navigate('/personal/diagnostics/task_sample')}>
                高级诊断（开发者）
              </button>
            </div>
          );
        }
        return (
          <PersonalHomeView
            tasks={[]}
            onRequestTask={() => setTaskStarted(true)}
            onOpenDiagnostics={() => navigate('/personal/diagnostics')}
          />
        );
    }
  })();

  return <div className="personal-app">{body}</div>;
}