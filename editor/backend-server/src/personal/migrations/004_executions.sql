-- 持久化执行记录。解决三个问题：
-- 1) 进程重启后 running 任务卡死（无记录可恢复）；
-- 2) 并发 /run 产生两个 Octop turn（无原子 claim）；
-- 3) 重试时重复写 evidence / 重复写文件（无幂等键）。
CREATE TABLE IF NOT EXISTS executions (
  execution_id   TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id),
  trace_id       TEXT NOT NULL,
  contract_version INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN
    ('queued','running','awaiting_confirmation','recoverable',
     'interrupted','verified','failed','blocked','unverifiable')),
  attempt        INTEGER NOT NULL DEFAULT 1,
  lease_owner    TEXT,
  lease_until    TEXT,
  heartbeat_at   TEXT,
  octop_agent_id TEXT,
  octop_thread_id TEXT,
  last_error     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- 同一 task 同时只能有一个活跃执行。SQLite 的部分唯一索引完美表达。
CREATE UNIQUE INDEX IF NOT EXISTS idx_executions_active_task
  ON executions(task_id)
  WHERE status IN ('queued','running','awaiting_confirmation','recoverable');

CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status, lease_until);

-- onboarding / 用户设置（版本化；localStorage 只允许缓存完成标记）。
CREATE TABLE IF NOT EXISTS personal_settings (
  id          TEXT PRIMARY KEY,
  version     INTEGER NOT NULL CHECK (version >= 1),
  settings    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- 搜索结果引用（后续 Task 落库用；先建表避免再迁移一次）。
CREATE TABLE IF NOT EXISTS search_receipts (
  event_id        TEXT PRIMARY KEY,
  execution_id    TEXT NOT NULL,
  provider        TEXT NOT NULL,
  query_hash      TEXT NOT NULL,
  query_redacted  TEXT NOT NULL,
  results_json    TEXT NOT NULL,
  captured_at     TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  response_hash   TEXT NOT NULL,
  external_data_decision TEXT NOT NULL CHECK (external_data_decision IN
    ('allowed','confirmed','denied')),
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_receipts_execution
  ON search_receipts(execution_id);
