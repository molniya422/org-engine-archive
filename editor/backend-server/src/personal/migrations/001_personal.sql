-- P1.2 personal store schema. All tables carry schema_version and created_at.
-- Ids follow the P1.1 canonical schemas (fact_/rule_/task_/evidence_/action_/
-- decision_/eval_/learning_ prefixes); conversation ids use conv_.

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  kind TEXT NOT NULL,
  value TEXT NOT NULL,                -- JSON
  source_refs TEXT NOT NULL,          -- JSON array of evidence_*
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('normal','sensitive','high')),
  status TEXT NOT NULL CHECK (status IN ('active','expired','revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  when_json TEXT NOT NULL,            -- JSON {"event":...,"scope":...}
  then_json TEXT NOT NULL,            -- JSON {"action":...,"message":...}
  priority INTEGER NOT NULL CHECK (priority >= 0),
  source TEXT NOT NULL CHECK (source IN ('user_explicit','user_approved_learning')),
  status TEXT NOT NULL CHECK (status IN ('active','paused','revoked')),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  goal TEXT NOT NULL,
  contract TEXT NOT NULL,             -- full TaskContract JSON
  status TEXT NOT NULL CHECK (status IN
    ('draft','planned','simulated','awaiting_confirmation','running','verified','blocked','cancelled')),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_states (
  id TEXT PRIMARY KEY,                -- conv_*
  current_task_id TEXT,
  intent TEXT,                        -- latest IntentEnvelope JSON
  intent_version INTEGER NOT NULL DEFAULT 1,
  resolved_refs TEXT NOT NULL DEFAULT '{}', -- JSON anaphora map
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  kind TEXT NOT NULL CHECK (kind IN
    ('file','tool_result','user_statement','execution_receipt','verification')),
  locator TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('normal','sensitive','high')),
  supports TEXT NOT NULL DEFAULT '[]',  -- JSON array
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  kind TEXT NOT NULL,
  parameters TEXT NOT NULL,           -- JSON
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
  expected_effect TEXT NOT NULL,
  rollback TEXT NOT NULL,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  requires_confirmation INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('proposed','approved','executed','verified','rejected','rolled_back')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  trace TEXT NOT NULL,                -- full DecisionTrace JSON
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  case_json TEXT NOT NULL,            -- full PersonalEvalCase JSON
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_proposals (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  proposal TEXT NOT NULL,             -- full LearningProposal JSON
  status TEXT NOT NULL CHECK (status IN
    ('proposed','approved','applied','rejected','reverted')),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}'   -- JSON
);

CREATE INDEX IF NOT EXISTS idx_facts_status ON facts(status);
CREATE INDEX IF NOT EXISTS idx_rules_status_priority ON rules(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_evidence_kind ON evidence(kind);
CREATE INDEX IF NOT EXISTS idx_actions_task ON actions(task_id);
CREATE INDEX IF NOT EXISTS idx_traces_task ON traces(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_ref ON audit_events(ref_type, ref_id);
