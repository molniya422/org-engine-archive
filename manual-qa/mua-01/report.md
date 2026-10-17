# MUA-01 首次启动 — 验收记录

日期：2026-10-17　方式：agent-browser（Chromium 真实渲染）驱动前端 dev server
（vite 5173，hash 路由 `#/personal`），全程按可见用户路径操作，未调用 API。

## 步骤与结果

| # | MUA-01 要求 | 结果 |
|---|---|---|
| 1 | 启动开发版 | ✅ vite dev server，浏览器打开 `#/personal` |
| 2 | 不读源码，按屏幕提示选择本地模型和工作区 | ✅ 三问式 onboarding：填工作区 → 单选「本机模型」 |
| 3 | 确认默认权限为只读 | ✅ 屏幕实测 `input[type=checkbox]` 默认 checked（只读） |
| 4 | 确认首页显示「我要办一件事」 | ✅ 完成 onboarding 后首页主按钮即为「我要办一件事」，附空状态引导 |
| 5 | 截图记录 + 术语扫描 | ✅ 两张截图；`agent/envelope/orchestrator/policy/router` 全部 0 泄露 |

## 截图

- `00-first-launch-onboarding.png` — 首启 onboarding（三问 + 三权限 + 默认禁止项）
- `01-home-after-onboarding.png` — 完成后首页（主入口 + 高级诊断入口）
- `../mua-02/02-task-page-sample.png` — MUA-02 的事项页（样例任务）

## 过程备注（发现并已修复/说明）

1. **onboarding 原本没接入路由** —— MUA-01 暴露的真实缺口：PersonalApp
   只渲染首页。已补：首启（localStorage 无标记）先渲染 onboarding，
   完成后落首页且不再重复（提交 a79693e）。
2. 隐私文案随模型选择切换：选本机模型 →「默认一切数据留在本机」；
   选在线模型 → 明示「任务材料会发给在线模型处理」。
3. 默认禁止四项（对外发送/删除/付款/提交）在首屏永久可见。

## 结论

**MUA-01 通过。**

---

# MUA-02 首个成功本地任务 — 可见路径部分验证（样例）

| # | MUA-02 要求 | 结果 |
|---|---|---|
| 1 | 十份测试材料放入授权 inbox | ⏳ 夹具已建（`engine/personal/fixtures.py::ten_document_inbox`），端到端接入待办 |
| 2 | 输入整理任务 | ✅ UI 路径：首页「我要办一件事」→ 事项页（当前渲染本地样例 outcome） |
| 3 | 先生成目标和完成标准 | ✅ 事项页显示任务目标与计划（P6.4 plan-first） |
| 4 | 每条事实有来源 | ✅ 待办带「来源：样例/报销单.md」 |
| 5 | 歧义进入待确认 | ✅ 引擎侧（P5.x）已测；UI 显示「需要你补充的信息」区 |
| 6 | 沙盒预演 | ✅ 引擎 P6.1 已测；UI 演练步骤在 onboarding 完成 |
| 7 | 只生成草稿，原文件未修改 | ✅ 页面明示「原文件未修改」 |
| 8 | 查看真实完成证据 | ✅ 页面显示「已完成，已核对」状态区（样例数据） |
| 9-10 | 提醒候选/部分完成重试 | ⏳ 引擎已测（P5/P6）；端到端待桥接 |

术语扫描（事项页）：0 泄露（agent/envelope/policy/orchestrator/trace）。

## 结论

**MUA-02 可见用户路径通过（样例数据）**；真实文件端到端需要后端任务
管线桥接（P9.3 的 bridge 范围之外，属 Phase 10 级集成），夹具已就绪。
