import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalRulesView, type PersonalRuleView } from './PersonalRulesView';
import { PersonalMemoryView, type MemoryItemView } from './PersonalMemoryView';
import { PrivacyView, type PrivacyStatusView } from './PrivacyView';

const RULES: PersonalRuleView[] = [
  {
    rule_id: 'rule_01', mood: 'never', statement: '对外发送任何内容',
    source: '你自己设置的', scope: '所有事项', status: 'active',
  },
  {
    rule_id: 'rule_02', mood: 'always', statement: '草稿放同一目录',
    source: '从你的使用中学到', scope: '仅报销材料', status: 'proposed',
  },
];

describe('P8.3 PersonalRulesView', () => {
  it('phrases rules as 我希望你总是/从不/先问我', () => {
    render(<PersonalRulesView rules={[...RULES,
      { rule_id: 'r3', mood: 'ask_first', statement: '删除任何文件', source: '你自己设置的', scope: '所有事项', status: 'active' }] } />);
    expect(screen.getByText('我希望你从不：对外发送任何内容')).toBeTruthy();
    expect(screen.getByText('我希望你总是：草稿放同一目录')).toBeTruthy();
    expect(screen.getByText('我希望你先问我：删除任何文件')).toBeTruthy();
  });

  it('shows source and scope for every rule; proposed is marked not-active', () => {
    render(<PersonalRulesView rules={RULES} />);
    expect(screen.getByText(/来源：你自己设置的/)).toBeTruthy();
    expect(screen.getByText(/生效范围：仅报销材料/)).toBeTruthy();
    expect(screen.getByText(/【待你批准，还没有生效】/)).toBeTruthy();
  });

  it('adding a rule uses the same phrasing and fires once', () => {
    const onAddRule = vi.fn();
    render(<PersonalRulesView rules={[]} onAddRule={onAddRule} />);
    fireEvent.change(screen.getByLabelText('规则类型'), { target: { value: 'never' } });
    fireEvent.change(screen.getByLabelText('规则内容'), { target: { value: '自动付款' } });
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));
    expect(onAddRule).toHaveBeenCalledWith('never', '自动付款');
  });
});

const MEMORIES: MemoryItemView[] = [
  { fact_id: 'fact_01', content: '每周五去健身房', source: '你在 10 月 4 日告诉我的', sensitivity: 'normal' },
  { fact_id: 'fact_02', content: '报销截止日是每月 20 号', source: '来自你的报销单', sensitivity: 'sensitive' },
];

describe('P8.3 PersonalMemoryView', () => {
  it('lists memories with sources', () => {
    render(<PersonalMemoryView memories={MEMORIES} />);
    expect(screen.getByText(/每周五去健身房/)).toBeTruthy();
    expect(screen.getByText(/来源：你在 10 月 4 日告诉我的/)).toBeTruthy();
  });

  it('supports edit and delete', () => {
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    render(<PersonalMemoryView memories={MEMORIES} onUpdate={onUpdate} onDelete={onDelete} />);
    fireEvent.click(screen.getAllByRole('button', { name: '修改' })[0]);
    fireEvent.change(screen.getByLabelText('修改记忆'), { target: { value: '每周三去健身房' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    expect(onUpdate).toHaveBeenCalledWith('fact_01', '每周三去健身房');
    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[1]);
    expect(onDelete).toHaveBeenCalledWith('fact_02');
  });

  it('supports export', () => {
    const onExport = vi.fn();
    render(<PersonalMemoryView memories={MEMORIES} onExport={onExport} />);
    fireEvent.click(screen.getByRole('button', { name: '导出全部记忆' }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

const PRIVACY: PrivacyStatusView = {
  local_files: [{ path: 'D:\\我的资料', readable: true }],
  model: { name: '本机小模型', where: '本机' },
  network: 'off',
  external_connections: [],
};

describe('P8.3 PrivacyView', () => {
  const DEFAULTS = [
    { name: '对外发送', value: '默认禁止', note: '需要你逐项确认才会执行' },
    { name: '删除文件', value: '默认禁止', note: '系统不会删除你的文件' },
    { name: '付款', value: '默认禁止', note: '任何支付动作都不会自动发生' },
    { name: '提交', value: '默认禁止', note: '提交到外部系统前必须你确认' },
  ];

  it('shows local files, model, network and external connection states', () => {
    render(<PrivacyView status={PRIVACY} dangerous_defaults={DEFAULTS} />);
    expect(screen.getByText(/D:\\我的资料——可读取/)).toBeTruthy();
    expect(screen.getByText(/本机小模型（本机）/)).toBeTruthy();
    expect(screen.getByText('网络访问：关闭')).toBeTruthy();
    expect(screen.getByText('没有任何外部连接。')).toBeTruthy();
  });

  it('visualizes all dangerous defaults', () => {
    render(<PrivacyView status={PRIVACY} dangerous_defaults={DEFAULTS} />);
    for (const d of ['对外发送', '删除文件', '付款', '提交']) {
      expect(screen.getByText(d)).toBeTruthy();
    }
    const text = document.body.textContent ?? '';
    expect((text.match(/默认禁止/g) ?? []).length).toBe(4);
  });

  it('states unusable local files honestly', () => {
    render(
      <PrivacyView
        status={{ ...PRIVACY, local_files: [{ path: 'X:\\损坏', readable: false }] }}
        dangerous_defaults={DEFAULTS}
      />,
    );
    expect(screen.getByText(/无法读取，需要你确认/)).toBeTruthy();
  });
});
