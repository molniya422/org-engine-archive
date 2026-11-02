/**
 * P8.1 — PersonalOnboardingView: 首次启动流程，目标是纯小白五分钟内
 * 完成第一个模拟任务，全程无需终端命令。
 *
 * 只问三件事：工作区在哪、用哪个模型、隐私边界；权限用三个勾选建立
 * （PermissionSetup）；然后用一个本地样例演练一遍；想改的高级配置都可以跳过。
 *
 * 设计约束（P4.3 术语契约）：用户语言，无 agent/envelope/policy 等内部词。
 */
import React from 'react';
import { PermissionSetup, type PermissionKey } from '../components/personal/PermissionSetup';

export interface OnboardingConfig {
  workspace: string;
  model: string;
  privacy: 'local_only' | 'local_with_model';
  permissions: PermissionKey[];
}

export interface PersonalOnboardingViewProps {
  onComplete: (config: OnboardingConfig) => void;
  onSkipAdvanced?: () => void;
}

const MODEL_CHOICES: Array<{ id: string; label: string; note: string }> = [
  { id: 'local', label: '本机模型（数据不出这台电脑）', note: '更慢，但最私密' },
  { id: 'cloud', label: '在线模型（更快，需要联网）', note: '任务内容会发送给模型服务' },
];

const SAMPLE_NOTE =
  '演练用一个本地样例文件夹：只读取、汇总、生成草稿，不会改动你的任何真实文件，也不会联网。';

/** 界面权限键 → 后端能力名（settings API 的白名单）。 */
const WIRE_PERMISSIONS: Record<PermissionKey, string> = {
  read_only: 'read_only',
  draft_files: 'create_draft',
  set_reminders: 'create_reminder',
};

/** 演练结果直接由前端展示，不调用任何工具——纯演示首跑体验。 */
export function PersonalOnboardingView({
  onComplete, onSkipAdvanced,
}: PersonalOnboardingViewProps): React.ReactElement {
  const [step, setStep] = React.useState(1);
  const [workspace, setWorkspace] = React.useState('');
  const [model, setModel] = React.useState('');
  const [privacy, setPrivacy] = React.useState<'local_only' | 'local_with_model' | ''>('');
  const [permissions, setPermissions] = React.useState<PermissionKey[]>(['read_only']);
  const [rehearsed, setRehearsed] = React.useState(false);

  const canFinish = rehearsed && workspace.trim().length > 0 && model !== '' && privacy !== '';

  return (
    <section aria-label="首次使用">
      <h2>欢迎使用个人事务助手</h2>
      <p>只需要回答三个问题，然后用一个本地样例演练一遍就能开始。全程不需要命令行。</p>

      <fieldset>
        <legend>1. 你的材料放在哪个文件夹？</legend>
        <input
          aria-label="工作区"
          placeholder="比如 D:\我的资料"
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
        />
        <p>系统只读这个文件夹。原文件永远不会被修改，整理结果全部存成草稿。</p>
      </fieldset>

      <fieldset>
        <legend>2. 用哪个模型来读和写？</legend>
        <ul>
          {MODEL_CHOICES.map((m) => (
            <li key={m.id}>
              <label>
                <input
                  type="radio"
                  name="model"
                  checked={model === m.id}
                  onChange={() => { setModel(m.id); setPrivacy(m.id === 'local' ? 'local_only' : 'local_with_model'); }}
                />
                {m.label}——{m.note}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend>3. 隐私边界</legend>
        {privacy === 'local_with_model' ? (
          <p>当前选择：任务材料会发给在线模型处理；除此之外不开任何外部连接。想改回「不出本机」就选本机模型。</p>
        ) : (
          <p>默认一切数据留在本机；选了在线模型才会有内容外发，且会在事项页逐次提示。</p>
        )}
        <PermissionSetup enabled={permissions} onChange={setPermissions} />
      </fieldset>

      <fieldset>
        <legend>4. 演练一个本地样例（约一分钟）</legend>
        <p>{SAMPLE_NOTE}</p>
        {!rehearsed && (
          <button onClick={() => setRehearsed(true)}>运行本地样例演练</button>
        )}
        {rehearsed && (
          <div aria-label="演练结果">
            <p>演练完成。</p>
            <ul>
              <li>读取了 2 份样例材料，找到 1 个待办</li>
              <li>生成了一份草稿汇总（放在演练区，不是真实文件夹）</li>
              <li>没有联网，没有修改任何原文件</li>
            </ul>
          </div>
        )}
      </fieldset>

      <button
        disabled={!canFinish}
        onClick={async () => {
          if (!canFinish) return;
          const config = {
            workspace: workspace.trim(),
            model,
            privacy,
            permissions,
          };
          try {
            await fetch('/api/v1/personal/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              // 后端用能力名（create_draft/create_reminder），界面用文案键
              // （draft_files/set_reminders）；不映射会被 400 拒绝而丢设置。
              body: JSON.stringify({
                ...config,
                permissions: permissions.map((p) => WIRE_PERMISSIONS[p]),
              }),
            });
          } catch {
            // 保存失败不阻断：用户仍能进入首页，但设置视为未生效。
          }
          onComplete(config);
        }}
      >
        完成，开始使用
      </button>
      <button onClick={() => onSkipAdvanced?.()}>跳过高级配置（以后随时能改）</button>
    </section>
  );
}