import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalHomeView } from './PersonalHomeView';
import { TaskCard, type TaskCardData } from '../components/personal/TaskCard';
import { EvidencePanel } from '../components/personal/EvidencePanel';

const TASKS: TaskCardData[] = [
  {
    task_id: 'task_01',
    goal: '整理本周的报销材料',
    status: 'awaiting_confirmation',
    next_step: '等你确认「创建整理草稿」这一步',
    risk: 'low',
    evidence_status: 'none',
    evidence: [],
    rollback_hint: '删除新建的草稿文件即可',
  },
  {
    task_id: 'task_02',
    goal: '为保险续费设置提醒',
    status: 'in_progress',
    next_step: '正在核对保险单上的到期日',
    risk: 'low',
    evidence_status: 'incomplete',
    evidence: [{ label: '保险单.md', source: '保险单.md 第 3 行', verification: 'incomplete' }],
    rollback_hint: '在提醒列表里删除即可',
  },
  {
    task_id: 'task_03',
    goal: '汇总上周会议纪要',
    status: 'completed',
    next_step: '没有下一步，已完成',
    risk: 'low',
    evidence_status: 'verified',
    evidence: [{ label: '汇总草稿.md', source: 'workspace/汇总草稿.md', verification: 'verified' }],
    rollback_hint: '删除草稿文件即可',
  },
  {
    task_id: 'task_04',
    goal: '核对一份看不懂的票据',
    status: 'attention',
    next_step: '需要你补充这张票据的日期',
    risk: 'medium',
    evidence_status: 'unverifiable',
    evidence: [{ label: '票据.pdf', source: '收件箱/票据.pdf', verification: 'unverifiable' }],
    rollback_hint: '无需撤销，未改动任何文件',
  },
];

describe('P8.2 TaskCard', () => {
  it('shows goal, next step, risk and evidence status', () => {
    render(<TaskCard task={TASKS[0]} statusLabel="待确认" />);
    expect(screen.getByText('整理本周的报销材料')).toBeTruthy();
    expect(screen.getByText(/下一步：等你确认/)).toBeTruthy();
    expect(screen.getByText(/风险：低风险/)).toBeTruthy();
    expect(screen.getByText(/还没有证据/)).toBeTruthy();
  });

  it('expands evidence via 查看依据 and offers 撤销', () => {
    const onRevoke = vi.fn();
    render(<TaskCard task={TASKS[2]} statusLabel="已完成" onRevoke={onRevoke} />);
    fireEvent.click(screen.getByRole('button', { name: '查看依据' }));
    expect(screen.getByText(/依据（1 条）/)).toBeTruthy();
    expect(screen.getAllByText(/已核对/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(onRevoke).toHaveBeenCalledWith('task_03');
  });

  it('EvidencePanel states the truth when there is no evidence', () => {
    render(<EvidencePanel evidence={[]} />);
    expect(screen.getByText(/还没有任何证据，这件事的状态未知/)).toBeTruthy();
  });
});

describe('P8.2 PersonalHomeView', () => {
  it('primary entry is 我要办一件事', () => {
    const onRequestTask = vi.fn();
    render(<PersonalHomeView tasks={TASKS} onRequestTask={onRequestTask} />);
    const entry = screen.getByRole('button', { name: '我要办一件事' });
    fireEvent.click(entry);
    expect(onRequestTask).toHaveBeenCalledTimes(1);
  });

  it('renders the four sections only when non-empty', () => {
    render(<PersonalHomeView tasks={TASKS} onRequestTask={vi.fn()} />);
    expect(screen.getByText(/待确认（1）/)).toBeTruthy();
    expect(screen.getByText(/进行中（1）/)).toBeTruthy();
    expect(screen.getByText(/已完成（1）/)).toBeTruthy();
    expect(screen.getByText(/需要关注（1）/)).toBeTruthy();
  });

  it('does not leak complexity or internal execution roles', () => {
    render(<PersonalHomeView tasks={TASKS} onRequestTask={vi.fn()} />);
    const text = document.body.textContent ?? '';
    for (const leak of ['agent', 'orchestrator', 'envelope', 'router', '复杂度', '执行角色', 'trace']) {
      expect(text.toLowerCase()).not.toContain(leak);
    }
  });

  it('empty state tells the user what to do next', () => {
    render(<PersonalHomeView tasks={[]} onRequestTask={vi.fn()} />);
    expect(screen.getByText(/现在没有进行中的事项/)).toBeTruthy();
  });
});
