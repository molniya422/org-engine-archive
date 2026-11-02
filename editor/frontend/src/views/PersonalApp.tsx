/**
 * P8.4/P8.5 — PersonalApp: 个人模式（默认模式）的容器。
 *
 * 默认用户流程完全不依赖高级模式：首页 → 「我要办一件事」→ 填目标 →
 * 真实创建任务 → 发起执行 → 轮询状态 → 展示真实证据。
 *
 * 本文件不含任何样例数据：`SAMPLE_OUTCOME`、`trace_sample_01` 已移除。
 * 状态的真实来源是 /api/v1/personal/tasks/:id 与 /executions/:id。
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PersonalHomeView } from './PersonalHomeView';
import { PersonalOnboardingView } from './PersonalOnboardingView';
import { PersonalTaskView } from './PersonalTaskView';
import { PersonalRulesView } from './PersonalRulesView';
import { PersonalMemoryView } from './PersonalMemoryView';
import { PrivacyView } from './PrivacyView';
import { PersonalLearningView } from './PersonalLearningView';
import { PersonalDiagnosticsView } from './PersonalDiagnosticsView';
import {
  pipelineApi, newTaskContract, describeRunError,
  TERMINAL_STATUSES, type ExecutionStatus, type EvidenceWire, type PendingActionWire,
} from '../api/pipeline';
import type { TaskCardData } from '../components/personal/TaskCard';

const ONBOARDING_KEY = 'personal-onboarded';
const POLL_MS = 3000;

/** 状态 → 用户语言。不出现 agent/policy/envelope 等内部词。 */
const STATUS_TEXT: Record<ExecutionStatus, string> = {
  queued: '排队中',
  running: '正在办理',
  awaiting_confirmation: '等你确认',
  recoverable: '需要继续',
  interrupted: '已中断',
  verified: '已完成，已核对',
  failed: '没有成功',
  blocked: '没能继续',
  unverifiable: '无法确认是否完成',
};

function toCardStatus(s: ExecutionStatus): TaskCardData['status'] {
  if (s === 'verified') return 'completed';
  if (s === 'awaiting_confirmation') return 'awaiting_confirmation';
  if (s === 'failed' || s === 'blocked' || s === 'unverifiable' || s === 'interrupted') {
    return 'attention';
  }
  return 'in_progress';
}

/** 从任务详情的 evidence 推断证据状态（只陈述事实，不美化）。 */
function evidenceStatus(evidence: Array<Record<string, unknown>>, execStatus: ExecutionStatus | null) {
  if (evidence.length === 0) return 'none' as const;
  if (execStatus === 'verified') return 'verified' as const;
  if (execStatus === 'unverifiable' || execStatus === 'failed') return 'unverifiable' as const;
  return 'incomplete' as const;
}

export function PersonalApp(): React.ReactElement {
  const navigate = useNavigate();
  const { tab, taskId } = useParams<{ tab?: string; taskId?: string }>();
  const [onboarded, setOnboarded] = React.useState(
    () => localStorage.getItem(ONBOARDING_KEY) === '1',
  );

  // -- 真实任务状态 --------------------------------------------------------
  const [goal, setGoal] = React.useState('');
  const [phase, setPhase] = React.useState<'home' | 'goal' | 'running'>('home');
  const [taskIdState, setTaskIdState] = React.useState<string | null>(null);
  const [executionId, setExecutionId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<ExecutionStatus | null>(null);
  const [evidence, setEvidence] = React.useState<EvidenceWire[]>([]);
  const [pending, setPending] = React.useState<PendingActionWire | null>(null);
  const [requireConfirmation, setRequireConfirmation] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [deciding, setDeciding] = React.useState(false);
  const [tasks, setTasks] = React.useState<TaskCardData[]>([]);

  // 轮询执行状态。终态即停；组件卸载 / 依赖变化立即清理。
  React.useEffect(() => {
    if (!executionId || phase !== 'running') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const { execution } = await pipelineApi.getExecution(executionId);
        if (cancelled) return;
        setStatus(execution.status);
        setPending(execution.pending ?? null);

        // 终态时再取一次任务详情，拿真实证据。
        if (TERMINAL_STATUSES.includes(execution.status)) {
          if (taskIdState) {
            try {
              const detail = await pipelineApi.getTask(taskIdState);
              if (!cancelled) setEvidence(detail.evidence ?? []);
            } catch {
              /* 证据取不到不影响终态展示 */
            }
          }
          return;
        }
      } catch (e) {
        if (!cancelled) setError(describeRunError(e));
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [executionId, phase, taskIdState]);

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
    // 诊断页只显示真实 trace；当前没有传入的数据源时明确说没有。
    return <PersonalDiagnosticsView traces={[]} />;
  }

  async function startTask() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const contract = newTaskContract(goal.trim(), { requireConfirmation });
      await pipelineApi.createTask(contract);
      const run = await pipelineApi.runTask(contract.id);
      setTaskIdState(contract.id);
      setExecutionId(run.execution_id);
      setStatus((run.status as ExecutionStatus) ?? 'queued');
      setPending(run.pending ?? null);
      setEvidence([]);
      setPhase('running');
      setTasks((prev) => [
        ...prev,
        {
          task_id: contract.id,
          goal: contract.goal,
          status: toCardStatus((run.status as ExecutionStatus) ?? 'queued'),
          next_step: STATUS_TEXT[(run.status as ExecutionStatus) ?? 'queued'],
          risk: contract.risk_level,
          evidence_status: 'none',
          evidence: [],
          rollback_hint: '可以取消这件事',
        },
      ]);
    } catch (e) {
      setError(describeRunError(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function retryTask() {
    if (!executionId || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await pipelineApi.resumeExecution(executionId);
      setStatus('queued');
    } catch (e) {
      setError(describeRunError(e));
    } finally {
      setSubmitting(false);
    }
  }

  /** 用户对"等你确认"做出决定：确认后执行，拒绝后终止。 */
  async function decide(decision: 'confirm' | 'reject') {
    if (!executionId || deciding) return;
    setError(null);
    setDeciding(true);
    try {
      if (decision === 'confirm') {
        const r = await pipelineApi.confirmExecution(executionId);
        setStatus((r.status as ExecutionStatus) ?? 'running');
      } else {
        const r = await pipelineApi.rejectExecution(executionId);
        setStatus((r.status as ExecutionStatus) ?? 'blocked');
      }
      setPending(null);
    } catch (e) {
      setError(describeRunError(e));
    } finally {
      setDeciding(false);
    }
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
              local_files: [],
              model: { name: '本机模型', where: '本机' },
              network: 'off',
              external_connections: [],
            }}
            dangerous_defaults={[
              { name: '对外发送', value: '默认禁止', note: '需要你逐项确认' },
              { name: '删除文件', value: '默认禁止', note: '系统不会删除你的文件' },
              { name: '付款', value: '默认禁止', note: '任何支付都不会自动发生' },
              { name: '提交', value: '默认禁止', note: '系统不会替你提交' },
            ]}
          />
        );
      case 'learning':
        return <PersonalLearningView proposals={[]} onApprove={() => {}} onReject={() => {}} />;
      default:
        if (phase === 'goal') {
          return (
            <section aria-label="办理事项">
              <h2>你想办什么事？</h2>
              <label htmlFor="goal-input">你想办什么事</label>
              <textarea
                id="goal-input"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="比如：把这十份材料整理成一份汇总表"
                rows={4}
              />
              <label>
                <input
                  type="checkbox"
                  checked={requireConfirmation}
                  onChange={(e) => setRequireConfirmation(e.target.checked)}
                />
                执行前先问我
              </label>
              {error && <p role="alert">{error}</p>}
              <button
                disabled={goal.trim().length === 0 || submitting}
                onClick={() => void startTask()}
              >
                {submitting ? '正在提交…' : '开始办理'}
              </button>
              <button onClick={() => { setPhase('home'); setError(null); }}>返回</button>
            </section>
          );
        }
        if (phase === 'running') {
          const terminal = status !== null && TERMINAL_STATUSES.includes(status);
          return (
            <section aria-label="正在办理">
              <h2>正在办理</h2>
              <p>{status ? STATUS_TEXT[status] : '已提交'}</p>
              <p>事项编号：{executionId}</p>

              {status === 'awaiting_confirmation' && (
                <section aria-label="等你确认">
                  <h3>这一步需要你确认</h3>
                  {pending ? (
                    <>
                      <p>{pending.description}</p>
                      {typeof pending.parameters.instruction === 'string' && (
                        <p>要做的事：{pending.parameters.instruction}</p>
                      )}
                      <button disabled={deciding} onClick={() => void decide('confirm')}>
                        确认执行
                      </button>
                      <button disabled={deciding} onClick={() => void decide('reject')}>
                        不执行
                      </button>
                    </>
                  ) : (
                    <p>正在读取需要确认的内容…</p>
                  )}
                </section>
              )}

              {error && (
                <p role="alert">
                  暂时无法办理：{error}
                </p>
              )}

              {status === 'recoverable' && (
                <button disabled={submitting} onClick={() => void retryTask()}>
                  继续办理
                </button>
              )}

              {terminal && evidence.length > 0 && (
                <>
                  <h3>依据（{evidence.length} 条）</h3>
                  <ul aria-label="依据">
                    {evidence.map((e) => (
                      <li key={String(e.id)}>
                        {String(e.kind)} —— {String(e.locator).slice(0, 80)}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <button
                onClick={() => {
                  setPhase('home');
                  setExecutionId(null);
                  setStatus(null);
                  setPending(null);
                  setEvidence([]);
                  setError(null);
                }}
              >
                回到首页
              </button>
              <button onClick={() => navigate('/personal/diagnostics')}>
                高级诊断（开发者）
              </button>
            </section>
          );
        }
        return (
          <PersonalHomeView
            tasks={tasks}
            onRequestTask={() => setPhase('goal')}
            onOpenDiagnostics={() => navigate('/personal/diagnostics')}
          />
        );
    }
  })();

  return <div className="personal-app">{body}</div>;
}
