-- 恢复执行所需的调度参数（envelope + plan）。
-- 没有它，requeue 后的行只有 status=queued，没有任何入口会真正再调 /v1/execute。
-- ALTER 不幂等：store.migrate() 先用 PRAGMA table_info 检查列是否存在再决定执行。
ALTER TABLE executions ADD COLUMN run_spec TEXT;
