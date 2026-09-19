---
name: xiaohongshu-post
description: "小红书笔记发布 workflow — 从主题研究、文案撰写、暗色系配图生成到最终发布的完整流程。适用于任何需要发布小红书笔记的场景。"
triggers:
  - "发小红书"
  - "写一篇小红书笔记"
  - "发布到小红书"
  - "小红书帖子"
  - "create xiaohongshu post"
  - "publish to xiaohongshu"
---

# 小红书笔记发布 Workflow

> 端到端流程：主题研究 → 文案撰写 → 暗色系配图生成 → 发布

## 整体架构

```
真实经验/主题
    ↓
[Step 1] 竞品研究（可选）
    ↓ 搜索类似帖子，提取写作模式
[Step 2] 文案撰写
    ↓ 真实经验 + 问题/解决 + 参数细节
[Step 3] 暗色系配图生成
    ↓ HTML → agent-browser 截图 → PNG
[Step 4] 发布
    ↓ xiaohongshu-mcp publish_content
[Step 5] 验证
```

## 前置条件

1. **真实素材**：用户需提供实际经验、配置文件、截图等原始材料
2. **MCP 服务**：`xiaohongshu-mcp` 在 `http://localhost:18060/mcp` 运行
3. **浏览器自动化**：`tools/agent-browser.sh` 可用，Chromium 在 `D:\Chromium\Application\chrome.exe`

## Step 1: 竞品研究（可选）

当用户只给主题没有具体素材时，先搜索类似帖子提取写作模式。

**触发条件**：用户提供主题名或模糊需求，没有具体配置文件/经验细节。

**执行**：
```bash
bash tools/agent-search.sh "小红书 <主题关键词> 本地部署/教程/经验"
```

**提取要素**：
- 标题格式（emoji + 核心卖点）
- 文案结构（痛点引入 → 方案 → 细节 → 互动收尾）
- 标签风格
- 配图数量与类型

**输出**：1-2 段写作模式摘要，交 Step 2 使用。

**⛔ 不执行**：当用户提供了具体的配置文件、脚本、日志等原始素材时，跳过此步，直接基于真实经验撰写。

## Step 2: 文案撰写

**核心原则**：基于用户的真实经验，不是教程式"如何做"，而是成功经验分享。

**⛔ 禁止**：
- 全面仿写其他帖子（用户多次纠正过）
- 教程式"第一步第二步"
- 求指导/问建议的语气（"有问题评论区见" 是可以的收尾）

**✅ 必须包含**：
- 具体参数配置（上下文、temperature、量化版本等）
- 遇到的问题 + 解决方法（踩坑记录）
- 真实硬件/环境信息
- 效果评估（速度、质量、适用场景）

**文案结构**：
```
标题（20字以内，带核心关键词）
↓
引言（一句话交代背景）
↓
核心方案（1-2段，讲清原理）
↓
细节配置（参数、版本、架构）
↓
踩坑记录（3-6条，问题+解决）
↓
效果总结
↓
互动收尾
```

**字数控制**：小红书正文上限 1000 字（含 emoji 和换行），发布前必须检查。

**输出文件**：`<project_dir>/post-content.md`

## Step 3: 配图生成

**视觉风格**：由用户决定。先搜索同类型帖子提取参考风格，再生成配图。

### 3.0 风格确定（必做）

**触发条件**：每次发布前必须执行，不可跳过。

**执行流程**：
1. 用户提供主题/素材后，先确认用户想要的视觉风格
2. 搜索同类型帖子提取参考：
   ```bash
   bash tools/agent-search.sh "小红书 <主题关键词> 笔记 配图风格"
   ```
3. 综合用户偏好 + 同类帖子风格，确定配色/布局/元素
4. 向用户确认风格方向后再生成 HTML

**风格来源优先级**：
1. 用户明确指定（"暗色系"、"明亮清新"、"极简白"等）
2. 同类热门帖子的视觉模式（从搜索中提取）
3. 内容主题的自然适配（技术类→暗色/科技感，生活类→明亮/温暖）

**风格要素**：
- 配色方案（背景、主色、强调色）
- 布局模式（居中/左右/卡片堆叠）
- 装饰元素（光晕/渐变/图案/留白）
- 字体层级（标题/正文/标签大小对比）

### 3.1 封面图（01-cover.html）

**固定结构**：
- 1080×1440 容器（3:4 小红书比例）
- 顶部：小字副标题
- 中心：大标题（强调核心卖点）
- 下方：描述/摘要文字
- 底部：标签行
- 背景装饰（根据确定风格：网格/光晕/渐变/纯色等）

**⚠️ CSS 陷阱**：不要用 `height: 1440px`，必须用 `min-height: 1440px` + `justify-content: center`，否则内容溢出会被截断。

### 3.2 内容图（02-features.html）

**结构**：
- 同尺寸容器
- 标题区（副标题 + 主标题 + 描述）
- 2-4 张信息卡片（根据内容密度调整）
- 底部标签行

**卡片样式模板**（根据风格选择）：

| 风格类型 | 卡片背景 | 边框 | 装饰 |
|---------|---------|------|------|
| 暗色科技 | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.08)` | 蓝紫光晕 + 网格纹理 |
| 明亮清新 | `rgba(0,0,0,0.02)` | `rgba(0,0,0,0.06)` | 柔彩渐变 + 圆角 |
| 极简白 | `#fff` | `rgba(0,0,0,0.08)` | 纯色 + 细线分割 |
| 暖色复古 | `rgba(255,240,220,0.3)` | `rgba(180,140,100,0.2)` | 暖光晕 + 纹理 |

### 3.3 截图流程

```bash
# 1. 打开 HTML
bash tools/agent-browser.sh open "file:///<path>/01-cover.html"

# 2. 全页截图（--full 捕获完整 1440px 高度）
bash tools/agent-browser.sh screenshot --full <path>/01-cover.png

# 3. 切换页面
bash tools/agent-browser.sh open "file:///<path>/02-features.html"
bash tools/agent-browser.sh screenshot --full <path>/02-features.png

# 4. 清理（wrapper 已自动处理）
bash tools/agent-browser.sh close --all
```

**验证**：截图后检查文件大小（空白截图 <10KB，正常 >50KB）。

## Step 4: 发布

**前置检查**：
```bash
mcp__xiaohongshu-mcp__check_login_status
```
如果未登录，引导用户扫码登录。

**发布调用**：
```python
mcp__xiaohongshu-mcp__publish_content(
  title="<标题，20字以内>",
  content="<正文，≤1000字>",
  images=["<path>/01-cover.png", "<path>/02-features.png"],
  tags=["标签1", "标签2", ...]
)
```

**字数检查**：发布前用字符计数确认 ≤1000 字。超限时精简：
- 合并短句
- 删除冗余描述
- 保留核心参数和踩坑记录

## Step 5: 验证

发布成功后：
1. 确认返回的 `PostID`
2. 保存发布记录（时间、标题、配图路径、标签）
3. 提示用户可在小红书查看

## 失败处理

| 错误 | 处理 |
|------|------|
| `当前输入长度为XXX，最大长度为1000` | 精简文案，合并短句，删除冗余 emoji |
| 截图只有半截 | 检查 CSS 是否用了 `height: 1440px`（应改为 `min-height`） |
| 浏览器未关闭导致 CPU 100% | `tools/agent-browser.sh` 已加自动 cleanup，无需手动干预 |
| MCP 未登录 | 调用 `get_login_qrcode`，引导用户扫码 |
| 发布失败无明确错误 | 检查 MCP 服务是否运行：`curl http://localhost:18060/health` |

## 设计参考（taste-skill 整合）

配图 HTML 遵循 `taste-skill` 的核心原则：
- **Layout variance**：封面居中对称，内容图卡片错落有致
- **Visual density**：封面稀疏（breathing），内容图紧凑（dense）
- **Typography**：72px 标题 + 24px 正文 + 20px 标签，强对比
- **Motion**：静态截图，但 CSS 预留 hover 动效（后续可加）
- **Anti-slop**：不用默认紫蓝渐变，用深色底 + 网格纹理 + 光晕，有辨识度

## 快速参考：一次完整发布

```bash
# 1. 准备素材（用户提供）
# 2. 撰写文案 → post-content.md
# 3. 生成配图 HTML → 01-cover.html + 02-features.html
# 4. 截图
bash tools/agent-browser.sh open "file:///<dir>/01-cover.html"
bash tools/agent-browser.sh screenshot --full <dir>/01-cover.png
bash tools/agent-browser.sh open "file:///<dir>/02-features.html"
bash tools/agent-browser.sh screenshot --full <dir>/02-features.png
# 5. 检查字数（≤1000字）
# 6. 发布
mcp__xiaohongshu-mcp__publish_content(...)
```
