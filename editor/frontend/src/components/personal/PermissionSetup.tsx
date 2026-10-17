/**
 * P8.1 — PermissionSetup: 用三个选择建立初始权限。
 *
 * 只读（默认开）、可生成草稿、可设置提醒。默认禁止项（发送、删除、付款、
 * 提交）永远显示，不受勾选影响，且不能在这里打开——那要到事项页逐项确认。
 */
import React from 'react';

export type PermissionKey = 'read_only' | 'draft_files' | 'set_reminders';

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  read_only: '只读：只看文件，不改任何东西',
  draft_files: '可生成草稿：新建草稿文件，原文件不动',
  set_reminders: '可设置提醒：在本机提醒列表里加提醒',
};

export const ALWAYS_FORBIDDEN: string[] = ['对外发送', '删除文件', '付款', '提交（对外系统）'];

export interface PermissionSetupProps {
  enabled: PermissionKey[];
  onChange: (enabled: PermissionKey[]) => void;
}

export function PermissionSetup({ enabled, onChange }: PermissionSetupProps): React.ReactElement {
  const toggle = (key: PermissionKey) => {
    if (enabled.includes(key)) {
      onChange(enabled.filter((k) => k !== key));
    } else {
      onChange([...enabled, key]);
    }
  };

  return (
    <section aria-label="初始权限">
      <h3>系统可以做什么（之后随时能改）</h3>
      <ul>
        {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map((key) => (
          <li key={key}>
            <label>
              <input
                type="checkbox"
                checked={enabled.includes(key)}
                onChange={() => toggle(key)}
              />
              {PERMISSION_LABELS[key]}
            </label>
          </li>
        ))}
      </ul>

      <p>无论怎么选，这些事情系统都不会自动做：</p>
      <ul aria-label="默认禁止项">
        {ALWAYS_FORBIDDEN.map((f) => (
          <li key={f}>{f}——默认禁止，需要你逐项确认才会执行</li>
        ))}
      </ul>
    </section>
  );
}
