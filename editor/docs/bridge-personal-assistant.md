# 个人助理 Bridge 集成（P9.3）

bridge/（lean-hooks 安装器）对个人助理的注入范围被严格限定。本文说明
边界、备份机制和验证方法。

## 注入范围：只有两个能力

| 能力 | 说明 |
|---|---|
| 启动（session_start） | 注入 hook 使个人助理在会话开始时可用 |
| 事件采集（user_confirmed_event） | 只采集用户**逐条确认过**的事件 |

**绝不自动发生的事**：shell 历史、命令日志、对话记录、transcript
永远不会自动转成个人事实。强制点在
`bridge/personal-event-guard.sh`——事件进入个人事实库之前的唯一通道，
五类被禁来源直接拒绝（退出码 2），未经确认的 confirmed_event 同样拒绝
（退出码 4）。甚至"python 解释器不可用"时也宁可拒绝（退出码 3），
不允许静默放行。

## 用户数据目录

- **视图1**：个人状态一律存放在用户选择的数据目录（`ORG_ENGINE_HOME`）。
- 守门员输出的 `data_dir` 即落盘位置；未设置时退回
  `~/.org-engine-editor`（与 P9.1 的路径规则一致）。

## 安装 / 升级 / 卸载都有备份

| 操作 | 备份 |
|---|---|
| 安装（升级路径） | `install.sh` 在覆盖前打包 `archive/backup-<ts>.tar.gz`；失败拒绝升级 |
| 卸载 | `uninstall.sh` 先打包 `archive/uninstall-backup-<ts>.tar.gz`，失败拒绝删除 |
| 卸载范围 | 只删 bridge 注入的 `harness/`、`training-loop/`；用户数据（`memory/`、`projects/`、`settings.json`、`archive/`）保留 |

## 可处置配置完整验证

`bash bridge/tests/test-install.sh`（28 项断言）：
用 `mktemp` 隔离的 disposable `CLAUDE_CONFIG_DIR` 完整跑安装→升级→
卸载→守门员四个环节，包括"升级备份必须含升级前文件"、"卸载后用户
记忆必须还在"、"被禁来源必须拒绝"。

## 失败隔离

Bridge 失败不阻断主应用：所有 hook 经 `error-handler.sh` 包装，非阻塞；
守门员拒绝事件只是"不采集"，主会话继续。
