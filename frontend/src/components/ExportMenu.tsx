import { useState, useRef, useEffect } from 'react';
import { api } from '@/api/client';
import { t } from '@/i18n';
import styles from './ExportMenu.module.css';

interface ExportMenuProps {
  orgId: string;
  orgName: string;
}

function getConfigPath(orgId: string): string {
  // Matches the backend's yaml-io BASE_DIR: ~/.org-engine-editor/orgs/<id>.yaml
  return `~/.org-engine-editor/orgs/${orgId}.yaml`;
}

export function ExportMenu({ orgId, orgName }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle');
  const [statusText, setStatusText] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const configPath = getConfigPath(orgId);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const download = async (format: 'yaml' | 'json') => {
    setStatus('loading');
    try {
      const text = await api.exportOrg(orgId, format);
      const ext = format === 'yaml' ? 'yaml' : 'json';
      const blob = new Blob([text], { type: format === 'yaml' ? 'text/yaml' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${orgName}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('idle');
      setOpen(false);
    } catch {
      setStatus('error');
      setStatusText('导出失败');
    }
  };

  const copy = async (text: string, label: string) => {
    setStatus('loading');
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
      setStatusText(`✓ ${label} 已复制`);
      setTimeout(() => { setStatus('idle'); setStatusText(''); }, 2500);
    } catch {
      setStatus('error');
      setStatusText('复制失败');
    }
  };

  const claudeCodeCmd = `# 直接在 Claude Code 中运行编排（需要 lean-hooks 环境）：
python -m harness.orchestrator_adapter \\
  --org-config "${configPath}" \\
  --task "<你的任务描述>"

# 或者在编辑器内使用 "▶ 运行" 按钮（推荐）`;

  return (
    <div className={styles.wrapper} ref={menuRef}>
      <button className={styles.trigger} onClick={() => setOpen(o => !o)} disabled={status === 'loading'}>
        {status === 'copied' ? statusText : status === 'loading' ? '...' : t('Export')} ▾
      </button>

      {open && (
        <div className={styles.menu}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>📄 下载文件</div>
            <button className={styles.item} onClick={() => download('yaml')}>下载 YAML</button>
            <button className={styles.item} onClick={() => download('json')}>下载 JSON</button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>📋 复制到剪贴板</div>
            <button className={styles.item} onClick={() => copy(configPath, '路径')}>
              复制配置文件路径
            </button>
            <button className={styles.item} onClick={async () => {
              const text = await api.exportOrg(orgId, 'yaml');
              copy(text, 'YAML');
            }}>
              复制 YAML 内容
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>🤖 Claude Code 集成</div>
            <div className={styles.deployHint}>
              <p>配置文件已自动保存到：</p>
              <code className={styles.blockCode}>{configPath}</code>

              <p style={{ marginTop: 10 }}>在 Claude Code 中运行编排：</p>
              <pre className={styles.pre}>
                <code>python -m harness.orchestrator_adapter \
  --org-config "{configPath}" \
  --task "你的任务描述"</code>
              </pre>

              <p style={{ marginTop: 10 }}>或通过编辑器一键运行（推荐）：</p>
              <ul className={styles.ul}>
                <li>打开组织编辑器</li>
                <li>点击 <strong>▶ 运行</strong> 按钮</li>
                <li>输入任务描述即可启动</li>
              </ul>

              <p style={{ marginTop: 10, color: 'var(--color-text-secondary)' }}>
                💡 运行状态会在首页和编辑器中实时显示。
              </p>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>📁 文件位置</div>
            <div className={styles.deployHint}>
              配置文件存储位置：<code className={styles.blockCode}>{configPath}</code>
              编辑器启动运行时，编排引擎会自动读取此文件。
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className={styles.toast}>{statusText || '操作失败'}</div>
      )}
    </div>
  );
}
