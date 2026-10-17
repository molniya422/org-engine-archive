-- P7.3 learning version store. 学习提案产生的配置版本（facts/rules/policy/
-- prompts）追加保存；状态流转（applied→enabled→rolled_back）与提案状态
-- （approved→applied→reverted）都持久化，刷新和重启后保持一致。
CREATE TABLE IF NOT EXISTS learning_versions (
  version_id TEXT PRIMARY KEY,        -- ver_*
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  kind TEXT NOT NULL CHECK (kind IN ('facts','rules','policy','prompts')),
  seq INTEGER NOT NULL CHECK (seq >= 1),
  content TEXT NOT NULL,              -- JSON，不可变
  proposal_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied','enabled','superseded','rolled_back')),
  eval_report TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_versions_kind ON learning_versions(kind, seq);