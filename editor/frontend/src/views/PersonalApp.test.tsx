import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useModeStore } from '../stores/mode-store';
import { PersonalDiagnosticsView } from './PersonalDiagnosticsView';
import { PersonalApp } from './PersonalApp';

beforeEach(() => {
  localStorage.removeItem('ui-mode');
  localStorage.setItem('personal-onboarded', '1'); // 既有用例已越过首启流程
  useModeStore.setState({ mode: 'personal' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, version: 1 }), { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

describe('P8.4 mode store', () => {
  it('defaults to personal mode', () => {
    expect(useModeStore.getState().mode).toBe('personal');
  });

  it('toggles personal ↔ advanced and persists', () => {
    useModeStore.getState().toggleMode();
    expect(useModeStore.getState().mode).toBe('advanced');
    expect(localStorage.getItem('ui-mode')).toBe('advanced');
    useModeStore.getState().toggleMode();
    expect(useModeStore.getState().mode).toBe('personal');
    expect(localStorage.getItem('ui-mode')).toBe('personal');
  });

  it('setMode works explicitly', () => {
    useModeStore.getState().setMode('advanced');
    expect(useModeStore.getState().mode).toBe('advanced');
  });
});

describe('P8.4 PersonalDiagnosticsView', () => {
  const TRACE = {
    trace_id: 'trace_01',
    task_id: 'task_01',
    policy_version: 'baseline-0.1',
    decision: '选择「创建整理草稿」：只写新文件，风险最低',
    raw_evidence_refs: ['evidence_invoice_a', 'evidence_invoice_b'],
    rule_refs: ['rule_01'],
  };

  it('shows trace id, policy version and raw evidence refs', () => {
    render(<PersonalDiagnosticsView traces={[TRACE]} />);
    expect(screen.getByText(/trace_id: trace_01/)).toBeTruthy();
    expect(screen.getByText(/policy_version: baseline-0\.1/)).toBeTruthy();
    expect(screen.getByText('evidence_invoice_a')).toBeTruthy();
  });

  it('says so when no trace exists', () => {
    render(<PersonalDiagnosticsView traces={[]} />);
    expect(screen.getByText(/还没有生成 trace/)).toBeTruthy();
  });
});

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/personal" element={<PersonalApp />} />
        <Route path="/personal/:tab" element={<PersonalApp />} />
        <Route path="/personal/diagnostics/:taskId" element={<PersonalApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P8.4/MUA-01 first-run onboarding', () => {
  beforeEach(() => {
    localStorage.removeItem('personal-onboarded');
  });

  it('first launch shows onboarding before the home screen', () => {
    renderAt('/personal');
    expect(screen.getByText('欢迎使用个人事务助手')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '我要办一件事' })).toBeNull();
  });

  it('completing onboarding lands on home and never repeats', async () => {
    const { unmount } = renderAt('/personal');
    fireEvent.click(screen.getByRole('button', { name: '运行本地样例演练' }));
    fireEvent.change(screen.getByLabelText('工作区'), { target: { value: 'D:\\我的资料' } });
    fireEvent.click(screen.getByLabelText(/本机模型/));
    fireEvent.click(screen.getByRole('button', { name: '完成，开始使用' }));
    // 完成时会先 PUT 设置（异步），落首页要等它结束。
    expect(await screen.findByRole('button', { name: '我要办一件事' })).toBeTruthy();
    expect(localStorage.getItem('personal-onboarded')).toBe('1');
    unmount();

    renderAt('/personal');
    expect(screen.queryByText('欢迎使用个人事务助手')).toBeNull();
  });

  it('deep links (diagnostics) skip onboarding', () => {
    localStorage.setItem('personal-onboarded', ''); // 未完成
    renderAt('/personal/diagnostics/task_x');
    expect(screen.getByText(/高级诊断/)).toBeTruthy();
  });
});

describe('P8.5 default flow uses the real pipeline, never samples', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/api/v1/personal/tasks')) {
        return new Response(JSON.stringify({ ok: true, id: 'task_real_1' }), { status: 201 });
      }
      if (/\/tasks\/[^/]+\/run$/.test(u)) {
        return new Response(JSON.stringify({
          execution_id: 'exec_real_1', status: 'running',
          plan: { verdict: 'select', selected_action: 'a0', reason: 'ok', missing_information: [], requires_confirmation: false },
        }), { status: 202 });
      }
      if (u.includes('/executions/')) {
        return new Response(JSON.stringify({
          execution: { execution_id: 'exec_real_1', task_id: 'task_x',
                       status: 'running', attempt: 1, last_error: null, octop_thread_id: null },
        }), { status: 200 });
      }
      if (/\/tasks\/[^/]+$/.test(u)) {
        return new Response(JSON.stringify({
          task: { id: 'task_x', status: 'running' }, evidence: [], traces: [],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'unexpected ' + u }), { status: 404 });
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders no sample outcome and no sample trace id', () => {
    renderAt('/personal');
    expect(screen.queryByText(/材料整理结果/)).toBeNull();
    expect(screen.queryByText(/trace_sample_01/)).toBeNull();
  });

  it('creates a real task and shows the real execution state', async () => {
    renderAt('/personal');
    fireEvent.click(screen.getByRole('button', { name: '我要办一件事' }));

    const input = await screen.findByLabelText('你想办什么事');
    fireEvent.change(input, { target: { value: '整理这些材料' } });
    fireEvent.click(screen.getByRole('button', { name: '开始办理' }));

    expect(await screen.findByRole('heading', { name: '正在办理' })).toBeTruthy();
    expect(screen.getByText(/exec_real_1/)).toBeTruthy();
  });

  it('shows a readable error when the backend refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'octop_not_configured' }), { status: 503 })));
    renderAt('/personal');
    fireEvent.click(screen.getByRole('button', { name: '我要办一件事' }));
    fireEvent.change(await screen.findByLabelText('你想办什么事'),
      { target: { value: '整理这些材料' } });
    fireEvent.click(screen.getByRole('button', { name: '开始办理' }));
    expect(await screen.findByText(/还没有连接执行环境/)).toBeTruthy();
  });

  it('non-home tabs render honest empty states', () => {
    renderAt('/personal/rules');
    expect(screen.getByText(/还没有任何规则/)).toBeTruthy();
  });
});

describe('P8.5 awaiting_confirmation is actionable, not a dead end', () => {
  const PENDING = {
    action_id: 'task_real_1_a0',
    kind: 'draft',
    description: '开始执行前先问我',
    parameters: { instruction: '整理这些材料' },
  };

  function mockConfirmationFlow() {
    // 与真实后端一致：确认/拒绝之前，轮询拿到的仍是 awaiting_confirmation + pending。
    let currentStatus = 'awaiting_confirmation';
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: u, body });
      if (u.endsWith('/api/v1/personal/tasks')) {
        return new Response(JSON.stringify({ ok: true, id: 'task_real_1' }), { status: 201 });
      }
      if (/\/tasks\/[^/]+\/run$/.test(u)) {
        return new Response(JSON.stringify({
          execution_id: 'exec_real_1', status: 'awaiting_confirmation',
          needs_confirmation: true, pending: PENDING,
        }), { status: 200 });
      }
      if (/\/executions\/[^/]+\/confirm$/.test(u)) {
        currentStatus = 'running';
        return new Response(JSON.stringify({ execution_id: 'exec_real_1', status: 'running' }), { status: 202 });
      }
      if (/\/executions\/[^/]+\/reject$/.test(u)) {
        currentStatus = 'blocked';
        return new Response(JSON.stringify({
          execution_id: 'exec_real_1', status: 'blocked', task_status: 'cancelled',
        }), { status: 200 });
      }
      if (u.includes('/executions/')) {
        return new Response(JSON.stringify({
          execution: { execution_id: 'exec_real_1', task_id: 'task_real_1',
                       status: currentStatus, attempt: 1, last_error: null,
                       octop_thread_id: null,
                       pending: currentStatus === 'awaiting_confirmation' ? PENDING : null },
        }), { status: 200 });
      }
      if (/\/tasks\/[^/]+$/.test(u)) {
        return new Response(JSON.stringify({
          task: { id: 'task_real_1', status: currentStatus }, evidence: [], traces: [],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'unexpected ' + u }), { status: 404 });
    }));
    return calls;
  }

  async function startTask() {
    renderAt('/personal');
    fireEvent.click(screen.getByRole('button', { name: '我要办一件事' }));
    fireEvent.change(await screen.findByLabelText('你想办什么事'),
      { target: { value: '整理这些材料' } });
    fireEvent.click(screen.getByRole('button', { name: '开始办理' }));
  }

  afterEach(() => vi.unstubAllGlobals());

  it('shows the pending action and confirm/reject buttons instead of a dead end', async () => {
    mockConfirmationFlow();
    await startTask();

    expect(await screen.findByText('开始执行前先问我')).toBeTruthy();
    expect(screen.getByText(/整理这些材料/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认执行' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '不执行' })).toBeTruthy();
  });

  it('confirm posts to the confirm endpoint and leaves the waiting state', async () => {
    const calls = mockConfirmationFlow();
    await startTask();

    fireEvent.click(await screen.findByRole('button', { name: '确认执行' }));
    await waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/executions/exec_real_1/confirm'))).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '确认执行' })).toBeNull();
    });
  });

  it('reject posts to the reject endpoint and reports a terminal state', async () => {
    const calls = mockConfirmationFlow();
    await startTask();

    fireEvent.click(await screen.findByRole('button', { name: '不执行' }));
    await waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/executions/exec_real_1/reject'))).toBe(true);
    });
    expect(await screen.findByText('没能继续')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '确认执行' })).toBeNull();
  });

  it('declares a confirmation point in the contract when the user opts in', async () => {
    const calls = mockConfirmationFlow();
    renderAt('/personal');
    fireEvent.click(screen.getByRole('button', { name: '我要办一件事' }));
    fireEvent.change(await screen.findByLabelText('你想办什么事'),
      { target: { value: '整理这些材料' } });
    fireEvent.click(screen.getByLabelText('执行前先问我'));
    fireEvent.click(screen.getByRole('button', { name: '开始办理' }));

    await waitFor(() => {
      expect(calls.some((c) => c.url.endsWith('/api/v1/personal/tasks'))).toBe(true);
    });
    const create = calls.find((c) => c.url.endsWith('/api/v1/personal/tasks'))!;
    expect(create.body.task.confirmation_points).toEqual([
      { action_kind: 'create_draft', description: '执行前先问我' },
    ]);
  });
});
