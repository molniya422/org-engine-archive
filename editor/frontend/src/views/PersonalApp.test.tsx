import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useModeStore } from '../stores/mode-store';
import { PersonalDiagnosticsView } from './PersonalDiagnosticsView';
import { PersonalApp } from './PersonalApp';

beforeEach(() => {
  localStorage.removeItem('ui-mode');
  useModeStore.setState({ mode: 'personal' });
});

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

describe('P8.4 default flow stays inside personal mode', () => {
  it('home → 我要办一件事 → task page → advanced diagnostics link', () => {
    const { container } = renderAt('/personal');
    expect(screen.getByRole('button', { name: '我要办一件事' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '我要办一件事' }));
    expect(screen.getByText(/材料整理结果/)).toBeTruthy();

    // 从事项页可以跳到高级诊断（P8.4 规则 3）
    fireEvent.click(screen.getByRole('button', { name: '高级诊断（开发者）' }));
    expect(screen.getByText(/trace_id: trace_sample_01/)).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it('non-home tabs render honest empty states', () => {
    renderAt('/personal/rules');
    expect(screen.getByText(/还没有任何规则/)).toBeTruthy();
  });

  it('the sample task never leaks internal jargon in default mode', () => {
    renderAt('/personal');
    fireEvent.click(screen.getByRole('button', { name: '我要办一件事' }));
    const text = document.body.textContent ?? '';
    for (const leak of ['agent', 'envelope', 'policy', 'orchestrator']) {
      expect(text.toLowerCase()).not.toContain(leak);
    }
    // 高级诊断入口存在但不强制——默认流程不依赖高级模式
    expect(screen.getByRole('button', { name: '高级诊断（开发者）' })).toBeTruthy();
  });
});