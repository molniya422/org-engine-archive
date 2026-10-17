-- P7.1 learning signals. 行为信号（用户对系统建议的反应）脱敏后入库，
-- 可完整追溯到 task/trace/evidence，但绝不保存高敏感正文。
CREATE TABLE IF NOT EXISTS learning_signals (
  id TEXT PRIMARY KEY,                 -- sig_*
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  event TEXT NOT NULL CHECK (event IN
    ('accepted','edited','rejected','revoked','repeated_correction')),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  trace_id TEXT NOT NULL REFERENCES traces(id),
  evidence_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of evidence_*
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('normal','sensitive','high')),
  signal_json TEXT NOT NULL,           -- 已脱敏的完整事件 JSON
  recorded_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_signals_task ON learning_signals(task_id);
CREATE INDEX IF NOT EXISTS idx_learning_signals_event ON learning_signals(event);