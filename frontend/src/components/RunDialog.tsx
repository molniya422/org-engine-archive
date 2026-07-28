import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import styles from './RunDialog.module.css';

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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>启动运行</h2>
        <p className={styles.hint}>
          使用当前组织配置运行多智能体编排。输入任务描述后点击启动。
        </p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label}>任务描述</label>
          <textarea
            className={styles.textarea}
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="例如：实现用户注册功能，包括前端页面和后端 API"
            disabled={starting}
            autoFocus
            rows={4}
          />
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={starting}>
            取消
          </button>
          <button
            className={styles.startBtn}
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
