import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';

interface RunDialogProps {
  orgId: string;
  open: boolean;
  onClose: () => void;
}

export function RunDialog({ orgId, open, onClose }: RunDialogProps) {
  const navigate = useNavigate();
  const [task, setTask] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleStart = async () => {
    if (!task.trim()) return;
    setStarting(true);
    setError(null);
    try {
      const result = await api.startRun(orgId, task.trim());
      onClose();
      navigate(`/studio/${orgId}/runs/${result.run_id}`);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-card border rounded-lg shadow-lg p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">启动运行</h2>
        <p className="text-sm text-muted-foreground mb-4">
          使用当前组织配置运行多智能体编排。输入任务描述后点击启动。
        </p>

        {error && <div className="bg-destructive/10 text-destructive text-sm p-2 rounded mb-4">{error}</div>}

        <div className="space-y-1 mb-4">
          <label className="text-sm font-medium">任务描述</label>
          <textarea
            className="w-full border rounded px-3 py-1.5 text-sm"
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="例如：实现用户注册功能，包括前端页面和后端 API"
            disabled={starting}
            autoFocus
            rows={4}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button className="px-4 py-1.5 border text-sm rounded hover:bg-accent" onClick={onClose} disabled={starting}>
            取消
          </button>
          <button
            className="px-4 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 disabled:opacity-50"
            onClick={handleStart}
            disabled={!task.trim() || starting}
          >
            {starting ? '启动中...' : '🚀 启动运行'}
          </button>
        </div>
      </div>
    </div>
  );
}
