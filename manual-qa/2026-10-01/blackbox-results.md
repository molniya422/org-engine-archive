# Black Box Run

Executed: 2026-10-01T10:57:34.432Z

| ID | Case | Status | Evidence |
|---|---|---|---|
| SM-01 | 首页 shell | PASS |  |
| SM-02 | 侧栏导航 | PASS |  |
| SM-03 | 主题切换 | PASS |  |
| SM-04 | 健康诊断 | PASS |  |
| ORG-01 | 通过界面创建组织 | PASS |  |
| ORG-04 | Studio 结构和角色编辑入口 | PASS |  |
| WF-01 | 工作流画布入口 | PASS |  |
| PB-01 | 剧本库和分类 | PASS |  |
| SK-01 | 技能页和 Schema 页 | PASS |  |
| EXP-01 | Studio 导出入口 | PASS |  |
| EXP-02 | 实际下载 YAML 和 JSON | FAIL | D:\claude-ecosystem\org-engine\manual-qa\2026-10-01\screenshots\EXP-02.png TimeoutError: page.waitForEvent: Timeout 5000ms exceeded while waiting for event "download"
=========================== logs ===========================
waiting for event "download"
============================================================ |
| RUN-00 | 运行入口和运行状态 | PASS |  |
| RUN-01 | 启动真实运行 | FAIL | D:\claude-ecosystem\org-engine\manual-qa\2026-10-01\screenshots\RUN-01.png TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================ |
| GOV-01 | 治理页面空状态 | PASS |  |
