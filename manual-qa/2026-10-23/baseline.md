# 基线记录 — 2026-10-23

执行开始时间：2026-10-23 21:08
分支：`p0-baseline-2026-10-09`
原始输出存档：`git-status.txt`、`py-tests.txt`、`ts-tests.txt`、`fe-tests.txt`、`services.txt`

## 1. 测试基线

| 套件 | 结果 | 存档 |
|---|---|---|
| Python `engine/personal` | **327 passed** | `py-tests.txt` |
| TS 后端 | **238 passed / 38 files** | `ts-tests.txt` |
| TS 前端 | **64 passed / 10 files** | `fe-tests.txt` |

## 2. 假绿清单（模块存在但从不被执行）

以下 7 个 personal 路由模块在 `src/server.ts` 里的出现次数均为 **0**：

```
eval.routes.ts       0
replay.routes.ts     0
simulation.routes.ts 0
rule.routes.ts       0
model.routes.ts      0
learning.routes.ts   0
octop.routes.ts      0
```

后果：这些模块各自有单测（`eval-routes.test.ts`、`replay-routes.test.ts`、
`simulation-routes.test.ts`、`personal-model-routes.test.ts`、`personal-rules.test.ts`、
`personal-learning-routes.test.ts`、`octop-routes.test.ts`），但测试只验证模块本身，
不验证"是否挂载"。**238 个通过的后端测试掩盖了 7 个端点全部 404 的事实。**

前端同样：`PersonalApp.tsx` 渲染 `SAMPLE_OUTCOME` / `trace_sample_01` /
`rules={[]}` / `proposals={[]}` / `tasks={[]}`；`Personal*View.tsx` 里
`fetch`、`personalApi`、`request(` 的出现次数全为 0。

## 3. 服务状态

三个依赖服务**全部未启动**（见 `services.txt`，三条 curl 均返回空）：

| 服务 | 端口 | 状态 |
|---|---|---|
| llama-server | 18080 | 未启动 |
| Octop | 8088 | 未启动 |
| personal decision service | 5174 | 未启动 |

## 4. 本计划的完成定义

- [ ] 7 个孤儿路由全部挂载，并有自动化守卫测试防止回退
- [ ] TS 与 Python 的 canonical JSON 在 5 组 golden 向量上哈希一致（含 float 拒绝）
- [ ] `/run` 返回 execution_id；同一 task 并发两次只产生一个 Octop turn
- [ ] 进程重启后 running 任务能恢复为 recoverable 或明确 interrupted
- [ ] Gate S：3 次真实搜索有来源 URL、隐私 canary 不外泄、4 种失败态可区分
- [ ] UI 不再渲染 SAMPLE_OUTCOME / trace_sample_01
- [ ] MUA-01..07 有真实执行证据（或明确标记 BLOCKED）

## 5. 已知历史失败（本计划不修）

- `npx tsc --noEmit`：8 条类型错误，位于 `learning/apply.ts`、`learning/routes.ts`、
  `personal/evidence.ts`、`personal/store.ts`。
- `engine/harness` 的 pytest collection 失败（`SystemExit: 1`）。
