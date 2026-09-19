import { useState, useRef, useEffect } from 'react';
import { api } from '@/api/client';
import { t } from '@/i18n';

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
    <div className="relative inline-block" ref={menuRef}>
      <button className="px-3 py-1.5 text-sm border rounded hover:bg-accent" onClick={() => setOpen(o => !o)} disabled={status === 'loading'}>
        {status === 'copied' ? statusText : status === 'loading' ? '...' : t('Export')} ▾
      </button>

      {open && (
        <div className="absolute right-0 mt-1 bg-card border rounded shadow-lg p-2 min-w-[280px] z-50">
          <div className="mb-2">
            <div className="text-xs font-semibold text-muted-foreground px-1 py-1">📄 下载文件</div>
            <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded" onClick={() => download('yaml')}>下载 YAML</button>
            <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded" onClick={() => download('json')}>下载 JSON</button>
          </div>

          <div className="mb-2">
            <div className="text-xs font-semibold text-muted-foreground px-1 py-1">📋 复制到剪贴板</div>
            <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded" onClick={() => copy(configPath, '路径')}>
              复制配置文件路径
            </button>
            <button className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded" onClick={async () => {
              const text = await api.exportOrg(orgId, 'yaml');
              copy(text, 'YAML');
            }}>
              复制 YAML 内容
            </button>
          </div>

          <div className="mb-2">
            <div className="text-xs font-semibold text-muted-foreground px-1 py-1">🤖 Claude Code 集成</div>
            <div className="text-xs text-muted-foreground px-1">
              <p>配置文件已自动保存到：</p>
              <code className="block bg-muted rounded p-1 text-xs font-mono mt-1">{configPath}</code>

              <p style={{ marginTop: 10 }}>在 Claude Code 中运行编排：</p>
              <pre className="bg-muted rounded p-2 overflow-x-auto text-xs">
                <code>python -m harness.orchestrator_adapter \
  --org-config "{configPath}" \
  --task "你的任务描述"</code>
              </pre>

              <p style={{ marginTop: 10 }}>或通过编辑器一键运行（推荐）：</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>打开组织编辑器</li>
                <li>点击 <strong>▶ 运行</strong> 按钮</li>
                <li>输入任务描述即可启动</li>
              </ul>

              <p style={{ marginTop: 10, color: 'var(--color-text-secondary)' }}>
                💡 运行状态会在首页和编辑器中实时显示。
              </p>
            </div>
          </div>

          <div className="mb-2">
            <div className="text-xs font-semibold text-muted-foreground px-1 py-1">📁 文件位置</div>
            <div className="text-xs text-muted-foreground px-1">
              配置文件存储位置：<code className="block bg-muted rounded p-1 text-xs font-mono mt-1">{configPath}</code>
              编辑器启动运行时，编排引擎会自动读取此文件。
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute bottom-0 right-0 bg-destructive text-destructive-foreground text-sm px-3 py-1 rounded shadow">{statusText || '操作失败'}</div>
      )}
    </div>
  );
}
