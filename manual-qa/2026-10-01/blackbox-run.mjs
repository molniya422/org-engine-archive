import { chromium } from '../../editor/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'D:/claude-ecosystem/org-engine/manual-qa/2026-10-01';
const screenshots = join(root, 'screenshots');
mkdirSync(screenshots, { recursive: true });
const results = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: 'D:/Chromium/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function caseResult(id, title, fn) {
  try {
    await fn();
    results.push({ id, title, status: 'PASS' });
  } catch (error) {
    const file = join(screenshots, `${id}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    results.push({ id, title, status: 'FAIL', error: String(error), evidence: file });
  }
}

await caseResult('SM-01', '首页 shell', async () => {
  await page.goto('http://127.0.0.1:15173/');
  await page.waitForLoadState('networkidle');
  await page.locator('nav').waitFor({ state: 'visible' });
  await page.locator('main, [role="main"], body').first().waitFor({ state: 'visible' });
  await page.screenshot({ path: join(screenshots, 'SM-01-home.png'), fullPage: true });
});

await caseResult('SM-02', '侧栏导航', async () => {
  for (const label of ['编排剧本', '技能', '会议记录', '通信审计', '产物注册表']) {
    const link = page.locator('nav a').filter({ hasText: label }).first();
    await link.click();
    await page.waitForLoadState('networkidle');
    await page.locator('body').waitFor({ state: 'visible' });
  }
  await page.screenshot({ path: join(screenshots, 'SM-02-navigation.png'), fullPage: true });
});

await caseResult('SM-03', '主题切换', async () => {
  await page.goto('http://127.0.0.1:15173/');
  await page.waitForLoadState('networkidle');
  const themeButton = page.locator('button[title*="模式"]').first();
  await themeButton.click();
  await page.locator('html.dark').waitFor();
  await page.screenshot({ path: join(screenshots, 'SM-03-dark.png'), fullPage: true });
  await themeButton.click();
});

await caseResult('SM-04', '健康诊断', async () => {
  await page.locator('button[title="诊断"]').click();
  await page.waitForLoadState('networkidle');
  await page.getByText('运行时路径', { exact: true }).waitFor();
  await page.screenshot({ path: join(screenshots, 'SM-04-health.png'), fullPage: true });
});

const orgName = `human-blackbox-${Date.now()}`;
await caseResult('ORG-01', '通过界面创建组织', async () => {
  await page.goto('http://127.0.0.1:15173/#/studio/new');
  await page.waitForSelector('input[placeholder="例如：我的团队"]');
  await page.fill('input[placeholder="例如：我的团队"]', orgName);
  await page.getByRole('button', { name: '创建组织' }).click();
  await page.waitForURL(/\/studio\//);
  await page.getByText('Arch', { exact: true }).first().waitFor();
  await page.screenshot({ path: join(screenshots, 'ORG-01-studio.png'), fullPage: true });
});

await caseResult('ORG-04', 'Studio 结构和角色编辑入口', async () => {
  await page.getByText('architect', { exact: true }).first().click();
  await page.getByText('编辑角色').first().waitFor().catch(async () => {
    await page.getByText('Edit Role').first().waitFor();
  });
  await page.screenshot({ path: join(screenshots, 'ORG-04-role-editor.png'), fullPage: true });
});

await caseResult('WF-01', '工作流画布入口', async () => {
  await page.getByRole('tab', { name: '工作流' }).click();
  await page.locator('[data-testid="workflow-canvas"]').waitFor();
  for (const label of ['智能体', '技能', '决策', '并行', '频道', '会议']) {
    await page.getByText(label, { exact: true }).first().waitFor();
  }
  await page.screenshot({ path: join(screenshots, 'WF-01-canvas.png'), fullPage: true });
});

await caseResult('PB-01', '剧本库和分类', async () => {
  await page.locator('nav a').filter({ hasText: '编排剧本' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByText('编排剧本', { exact: true }).first().waitFor();
  for (const label of ['全部', '搭建', '审计', '部署', '研究']) {
    await page.getByRole('tab', { name: label }).click();
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: join(screenshots, 'PB-01-playbooks.png'), fullPage: true });
});

await caseResult('SK-01', '技能页和 Schema 页', async () => {
  await page.locator('nav a').filter({ hasText: '技能' }).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: /技能|Skills/ }).waitFor();
  await page.getByRole('button', { name: /Rescan|重新扫描/ }).click();
  await page.getByRole('tab', { name: /Schema|架构/ }).click();
  await page.screenshot({ path: join(screenshots, 'SK-01-skills-schema.png'), fullPage: true });
});

await caseResult('EXP-01', 'Studio 导出入口', async () => {
  await page.goto(`http://127.0.0.1:15173/#/studio/${orgName}`);
  await page.waitForLoadState('networkidle');
  const exportButton = page.getByRole('button', { name: /导出|Export/ }).first();
  await exportButton.waitFor();
  await exportButton.click();
  await page.getByText(/下载 YAML|Download YAML/).first().waitFor();
  await page.screenshot({ path: join(screenshots, 'EXP-01-export-menu.png'), fullPage: true });
});

await caseResult('EXP-02', '实际下载 YAML 和 JSON', async () => {
  await page.goto(`http://127.0.0.1:15173/#/studio/${orgName}`);
  await page.waitForLoadState('networkidle');
  const exportButton = page.getByRole('button', { name: /导出|Export/ }).first();
  await exportButton.click();
  const [yaml] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.getByRole('button', { name: /下载 YAML|Download YAML/ }).click(),
  ]);
  await yaml.saveAs(join(root, 'exports', `${orgName}.yaml`));
  await exportButton.click();
  const [json] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }),
    page.getByRole('button', { name: /下载 JSON|Download JSON/ }).click(),
  ]);
  await json.saveAs(join(root, 'exports', `${orgName}.json`));
});

await caseResult('RUN-00', '运行入口和运行状态', async () => {
  await page.goto(`http://127.0.0.1:15173/#/studio/${orgName}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: '运行' }).click();
  await page.getByText('任务描述', { exact: true }).waitFor();
  await page.getByRole('button', { name: /启动运行/ }).waitFor();
  await page.screenshot({ path: join(screenshots, 'RUN-00-run-panel.png'), fullPage: true });
});

await caseResult('RUN-01', '启动真实运行', async () => {
  await page.goto(`http://127.0.0.1:15173/#/studio/${orgName}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: '运行' }).click();
  const task = page.locator('textarea[placeholder="描述多智能体编排的任务..."]');
  await task.fill('请把这个任务拆成架构、实现、测试和文档四个阶段，并记录每个阶段的结果。');
  await page.getByRole('button', { name: /启动运行/ }).click();
  await page.waitForURL(/\/runs\//, { timeout: 15000 });
  await page.getByText(/运行控制台/).waitFor();
  await page.screenshot({ path: join(screenshots, 'RUN-01-monitor.png'), fullPage: true });
});

await caseResult('GOV-01', '治理页面空状态', async () => {
  for (const route of ['#/meetings', '#/comm', '#/products']) {
    await page.goto(`http://127.0.0.1:15173/${route}`);
    await page.waitForLoadState('networkidle');
    await page.locator('body').waitFor({ state: 'visible' });
  }
  await page.screenshot({ path: join(screenshots, 'GOV-01-governance.png'), fullPage: true });
});

await browser.close();
const markdown = [
  '# Black Box Run',
  '',
  `Executed: ${new Date().toISOString()}`,
  '',
  '| ID | Case | Status | Evidence |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.status} | ${r.evidence ?? ''}${r.error ? ` ${r.error}` : ''} |`),
  '',
].join('\n');
writeFileSync(join(root, 'blackbox-results.md'), markdown, 'utf8');
process.stdout.write(JSON.stringify(results, null, 2));
