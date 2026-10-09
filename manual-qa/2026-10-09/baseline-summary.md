# Phase 0.1 Baseline Record — 2026-10-09

执行日期：2026-10-09（计划文档日期 2026-10-04，实际执行以本日为准）。
命令全部存档于 `manual-qa/2026-10-09/baseline/`。

## 1. 测试与构建结果

| 命令 | 结果 | 存档 |
| --- | --- | --- |
| `npm test`（editor） | ✅ 后端 75 通过 / 前端 11 通过 | 01-npm-test.txt |
| `npm run build:backend` | ✅ 通过（bundle 1.9mb） | 02-build-backend.txt |
| `npm run build:frontend` | ✅ 通过（chunk 1.59MB > 500kB 警告） | 03-build-frontend.txt |
| `npm run build:electron` | ✅ 通过 | 04-build-electron.txt |
| `pytest engine/tests` | ⚠️ 默认收集失败；`PYTHONPATH=engine` 后 16 通过 | 05-pytest-engine-tests.txt |
| `pytest engine/harness` | ⚠️ 99 通过 / 18 失败 / 11 收集错误 | 06-pytest-engine-harness.txt |

## 2. 失败分类

### A. Python 包路径问题（env-deps）
- `engine/tests` 默认运行即 `ModuleNotFoundError: No module named 'harness'`。
  需 `PYTHONPATH=engine` 才可收集。与复盘文档中根 `orchestrator` 包路径问题同类。
- `test_skill_attention_20dim.py` / `test_skill_attention_cost_matrix.py`（18 个断言失败）：
  根因为测试读取 `D:\claude-ecosystem\org-engine\config\harness\skill-attention.py`，
  该路径在 engine 仓库内不存在（真实资产在仓库外 `config/harness/`）。测试与资产位置脱节。

### B. 过期 import / schema 漂移（type-build）
- `test_training_loop_20rounds.py`：`from metrics_core import compute_windowed_metrics`，
  `engine/training-loop/metrics_core.py` 已升级 v2.2 不再导出该函数。测试落后于实现。

### C. 环境依赖数据库（env-deps）
- `test_skillopt_v4.py`：`sqlite3.OperationalError: unable to open database file`，
  DB_PATH 依赖外部 claude-mem 数据目录，未就绪。
- `test_multiagent_toolcall_e2e.py`：`SystemExit: 1`，需要外部运行环境。
- `test_all.py` 部分子测试：依赖 `config/harness/` 等仓库外路径。

### D. 本次未覆盖（留待 P0-A/P0-B 人工验收）
- 导出（YAML/JSON）前端点击→浏览器下载真实链路：计划 P0.2。
- 运行 Starting→blocked 状态：计划 P0.3。
- Bridge 安装复制数量：计划 P0.4。
- Electron 打包启动（历史 Crashpad 阻塞）：未在本基线复现，需 P9 前另行确认。

## 3. 结论与门槛

后续每个阶段都必须与此基线对比：**不能把既有失败伪装成新功能通过**。

- editor 前端/后端与三构建：基线健康，P0-A/P0-B 可在其上安全加测试。
- Python harness：18 failed + 11 errors 是真实既有失败，P0 修复时按
  `修复包路径 / 对齐 metrics_core / 解耦外部 DB` 三类处理，不改变个人领域语义。
- 包路径修复顺序优先：`test_skill_attention_*`（18 失败）影响面最大。
