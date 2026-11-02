import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonalOnboardingView } from './PersonalOnboardingView';
import {
  PermissionSetup, ALWAYS_FORBIDDEN, PERMISSION_LABELS,
} from '../components/personal/PermissionSetup';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, version: 1 }), { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

describe('P8.1 PermissionSetup', () => {
  it('builds initial permission from exactly three choices', () => {
    expect(Object.keys(PERMISSION_LABELS).length).toBe(3);
    const onChange = vi.fn();
    render(<PermissionSetup enabled={['read_only']} onChange={onChange} />);
    expect(screen.getByLabelText(/只读/)).toBeTruthy();
    expect(screen.getByLabelText(/可生成草稿/)).toBeTruthy();
    expect(screen.getByLabelText(/可设置提醒/)).toBeTruthy();
  });

  it('read-only is on by default and toggling reports the change', () => {
    const onChange = vi.fn();
    render(<PermissionSetup enabled={['read_only']} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/可生成草稿/));
    expect(onChange).toHaveBeenCalledWith(['read_only', 'draft_files']);
  });

  it('shows all default-forbidden actions', () => {
    render(<PermissionSetup enabled={[]} onChange={vi.fn()} />);
    for (const f of ['对外发送', '删除文件', '付款', '提交']) {
      expect(screen.getByText(new RegExp(f))).toBeTruthy();
    }
  });
});

describe('P8.1 PersonalOnboardingView', () => {
  it('asks only workspace, model and privacy — no terminal commands anywhere', () => {
    render(<PersonalOnboardingView onComplete={vi.fn()} />);
    expect(screen.getByText('欢迎使用个人事务助手')).toBeTruthy();
    expect(screen.getByText(/材料放在哪个文件夹/)).toBeTruthy();
    expect(screen.getByText(/用哪个模型/)).toBeTruthy();
    expect(screen.getByText(/隐私边界/)).toBeTruthy();
    const text = document.body.textContent ?? '';
    for (const jargon of ['agent', 'envelope', 'policy', 'shell', 'command', 'terminal']) {
      expect(text.toLowerCase()).not.toContain(jargon);
    }
  });

  it('finishing requires the local-sample rehearsal, then reports the config', async () => {
    const onComplete = vi.fn();
    render(<PersonalOnboardingView onComplete={onComplete} />);
    const finish = screen.getByRole('button', { name: '完成，开始使用' }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('工作区'), { target: { value: 'D:\\我的资料' } });
    fireEvent.click(screen.getByLabelText(/本机模型/));
    fireEvent.click(screen.getByRole('button', { name: '运行本地样例演练' }));
    expect(screen.getByText(/演练完成/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/可生成草稿/));

    const finish2 = screen.getByRole('button', { name: '完成，开始使用' }) as HTMLButtonElement;
    expect(finish2.disabled).toBe(false);
    fireEvent.click(finish2);
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
      workspace: 'D:\\我的资料',
      model: 'local',
      privacy: 'local_only',
      permissions: ['read_only', 'draft_files'],
    }));

    // 后端只认能力名：界面的 draft_files 必须以 create_draft 落库，否则 400。
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/personal/settings');
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(String(init?.body));
    expect(body.permissions).toEqual(['read_only', 'create_draft']);
  });

  it('offers a skip path for advanced configuration', () => {
    const onSkipAdvanced = vi.fn();
    render(<PersonalOnboardingView onComplete={vi.fn()} onSkipAdvanced={onSkipAdvanced} />);
    fireEvent.click(screen.getByRole('button', { name: /跳过高级配置/ }));
    expect(onSkipAdvanced).toHaveBeenCalledTimes(1);
  });
});
