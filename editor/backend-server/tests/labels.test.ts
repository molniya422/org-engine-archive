import { describe, it, expect } from 'vitest';
import {
  roleLabel, routeLabel, statusLabel, actionKindLabel, exposesJargon,
} from '../src/personal/labels';

describe('P4.3 user-facing labels', () => {
  it('maps internal roles to plain language', () => {
    expect(roleLabel('ceo')).toBe('负责人');
    expect(roleLabel('gateway')).toBe('传递站');
    expect(roleLabel('worker')).toBe('帮手');
  });

  it('maps execution routes to plain language', () => {
    expect(routeLabel('simple')).toBe('直接整理');
    expect(routeLabel('parallel')).toBe('多人协作整理');
  });

  it('statuses say what the user should do, not how it works', () => {
    expect(statusLabel('needs_confirmation')).toBe('需要你确认');
    expect(statusLabel('blocked')).toBe('按你的规则不执行');
    expect(statusLabel('unverifiable')).toBe('无法确认是否完成');
  });

  it('high-risk kinds get plain names', () => {
    expect(actionKindLabel('external_send')).toBe('对外发送');
    expect(actionKindLabel('payment')).toBe('付款');
  });

  it('new-user surfaces must not expose agent jargon', () => {
    const homeTexts = [
      statusLabel('needs_confirmation'),
      statusLabel('select'),
      routeLabel('simple'),
      routeLabel('review'),
      routeLabel('parallel'),
      roleLabel('ceo'),
      roleLabel('manager'),
      actionKindLabel('external_send'),
    ];
    for (const text of homeTexts) {
      expect(exposesJargon(text)).toBe(false);
    }
  });

  it('unknown values pass through unchanged (diagnostics page keeps raw trace)', () => {
    expect(statusLabel('weird_status')).toBe('weird_status');
    expect(roleLabel('custom_role')).toBe('custom_role');
  });
});
