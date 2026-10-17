/**
 * P8.3 — PrivacyView: 隐私页，一屏回答「数据在哪、谁碰过」。
 *
 * 四个状态区：本地文件、模型、网络、外部连接——全部可视化，开着关着
 * 一目了然。所有危险默认值集中在「危险默认值」区展示（P8.3 规则 5），
 * 禁止就是禁止，含糊的表述不允许出现。
 */
import React from 'react';

export type ConnectorState = 'off' | 'on' | 'ask_first';

export interface PrivacyStatusView {
  local_files: { path: string; readable: boolean }[];
  model: { name: string; where: '本机' | '在线' };
  network: ConnectorState;
  external_connections: Array<{ name: string; state: ConnectorState }>;
}

export interface PrivacyViewProps {
  status: PrivacyStatusView;
  /** 危险默认值逐项可视化：名称 + 当前值 + 说明 */
  dangerous_defaults: Array<{ name: string; value: string; note: string }>;
}

const STATE_TEXT: Record<ConnectorState, string> = {
  off: '关闭',
  on: '开启',
  ask_first: '需要先问你',
};

export function PrivacyView({ status, dangerous_defaults }: PrivacyViewProps): React.ReactElement {
  return (
    <section aria-label="隐私">
      <h2>隐私状态</h2>

      <div aria-label="本地文件">
        <h3>本地文件</h3>
        <p>系统只读取你指定的工作区，原文件永不修改：</p>
        <ul>
          {status.local_files.map((f) => (
            <li key={f.path}>
              {f.path}——{f.readable ? '可读取' : '无法读取，需要你确认'}
            </li>
          ))}
        </ul>
      </div>

      <div aria-label="模型">
        <h3>模型</h3>
        <p>{status.model.name}（{status.model.where}）</p>
      </div>

      <div aria-label="网络">
        <h3>网络</h3>
        <p>网络访问：{STATE_TEXT[status.network]}</p>
      </div>

      <div aria-label="外部连接">
        <h3>外部连接</h3>
        {status.external_connections.length === 0 && <p>没有任何外部连接。</p>}
        <ul>
          {status.external_connections.map((c) => (
            <li key={c.name}>
              {c.name}——{STATE_TEXT[c.state]}
            </li>
          ))}
        </ul>
      </div>

      <div aria-label="危险默认值">
        <h3>危险的事情，默认都不能做</h3>
        <ul>
          {dangerous_defaults.map((d) => (
            <li key={d.name}>
              <strong>{d.name}</strong>：{d.value}——{d.note}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}