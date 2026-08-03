import { test, expect } from '@playwright/test';

// NOTE: The app uses createHashRouter (required for Electron file:// packaging),
// so every navigation must go through `/#/...`, NOT `/...`. The UI is Chinese
// (shadcn/ui), so selectors target the real labels shown on screen.
async function createOrgViaForm(page: import('@playwright/test').Page, name: string) {
  await page.goto('/#/studio/new');
  await page.waitForSelector('input[placeholder="例如：我的团队"]', { timeout: 5000 });
  await page.fill('input[placeholder="例如：我的团队"]', name);
  await page.click('button:has-text("创建组织")');
  // Redirect to the created org's studio page (slug id)
  await page.waitForURL(/\/studio\/(?!new)/, { timeout: 8000 });
  // Wait for the org to finish loading (tab bar only renders after loadOrg resolves)
  await page.waitForSelector('button:has-text("工作流")', { timeout: 8000 });
}

test.describe('Workflow Editor', () => {
  test.beforeEach(async ({ page }) => {
    await createOrgViaForm(page, 'TestOrg');
  });

  test('should display workflow tab in studio', async ({ page }) => {
    await page.locator('button:has-text("工作流")').first().click();
    await expect(page.locator('[data-testid="workflow-canvas"]')).toBeVisible({ timeout: 5000 });
  });

  test('should show node draggable items in toolbar', async ({ page }) => {
    await page.locator('button:has-text("工作流")').first().click();
    for (const label of ['智能体', '技能', '决策', '并行']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('should show properties panel hint when no node selected', async ({ page }) => {
    await page.locator('button:has-text("工作流")').first().click();
    await expect(page.getByText('选择画布上的节点以编辑属性').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show clear and save buttons', async ({ page }) => {
    await page.locator('button:has-text("工作流")').first().click();
    await expect(page.locator('button:has-text("清空")')).toBeVisible();
    await expect(page.locator('button:has-text("保存")')).toBeVisible();
  });

  test('should edit a generated agent node role in properties panel', async ({ page }) => {
    // Regression for the stale-selectedNode bug: role edits used to be lost.
    await page.locator('button:has-text("工作流")').first().click();
    await expect(page.locator('[data-testid="workflow-canvas"]')).toBeVisible({ timeout: 5000 });
    // Generate nodes from the org's departments
    await page.locator('button:has-text("从组织生成")').click();
    await page.waitForSelector('.react-flow__node', { timeout: 5000 });
    // Select the first agent node
    await page.locator('.react-flow__node').first().click();
    const roleInput = page.locator('input[placeholder="如：研究员"]');
    await roleInput.fill('新角色名');
    await expect(roleInput).toHaveValue('新角色名');
  });

  test('should navigate to template library', async ({ page }) => {
    await page.goto('/#/templates');
    await expect(page.getByText('编排剧本').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('组织搭建').first()).toBeVisible();
  });

  test('should filter templates by category', async ({ page }) => {
    await page.goto('/#/templates');
    await page.locator('button:has-text("审计")').first().click();
    await expect(page.getByText('审计运行').first()).toBeVisible({ timeout: 5000 });
  });

  test('should load built-in templates', async ({ page }) => {
    await page.goto('/#/templates');
    await expect(page.getByText('组织搭建').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show sidebar navigation links', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('nav a:has-text("编排剧本")')).toBeVisible({ timeout: 5000 });
  });

  test('should show theme toggle in sidebar', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('nav button[title*="模式"]')).toBeVisible({ timeout: 5000 });
  });

  // ── workflow v2: 会议节点 / 频道节点 / 消息边 / 强绑定 ──
  test('should show meeting and channel palette items', async ({ page }) => {
    await page.locator('button:has-text("工作流")').first().click();
    await expect(page.getByText('会议', { exact: true }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('频道', { exact: true }).first()).toBeVisible();
  });

  test('should offer message-edge connection mode', async ({ page }) => {
    await page.locator('button:has-text("工作流")').first().click();
    // 连接模式下拉：流程边(value=flow) / 消息边(value=message)
    const modeSelect = page.locator('select').first();
    await expect(modeSelect).toBeVisible({ timeout: 5000 });
    await expect(modeSelect.locator('option[value="message"]')).toHaveText('消息边');
  });

  test('should show role_ref selector and binding check for agent nodes', async ({ page }) => {
    await page.locator('button:has-text("工作流")').first().click();
    await expect(page.locator('[data-testid="workflow-canvas"]')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("从组织生成")').click();
    await page.waitForSelector('.react-flow__node', { timeout: 5000 });
    await page.locator('.react-flow__node').first().click();
    // 强绑定：role_ref 下拉（org 角色注册表）
    await expect(page.getByText('组织角色 (role_ref)').first()).toBeVisible({ timeout: 5000 });
    // 强绑定校验面板（引用完整性 + 环检测）
    await expect(page.getByText('强绑定校验').first()).toBeVisible();
  });
});

test.describe('Workflow Editor — CJK org name', () => {
  // Isolated from the beforeEach above: creating a second org from an already-loaded
  // studio is only a hash change (no page reload), so StudioView keeps the previous
  // org in memory and never renders NewOrgForm. A fresh context/page is required.
  test('should create an org with a Chinese name', async ({ page }) => {
    // CJK names previously failed both client-side sanitize and backend schema
    await page.goto('/#/studio/new');
    await page.waitForSelector('input[placeholder="例如：我的团队"]', { timeout: 5000 });
    await page.fill('input[placeholder="例如：我的团队"]', '我的测试团队');
    await page.click('button:has-text("创建组织")');
    // slugify() falls back to a stable org-<hash> id for CJK-only names
    await page.waitForURL(/\/studio\/org-/, { timeout: 8000 });
    // New org uses the full org-engine template → Arch department present
    await expect(page.getByText('Arch').first()).toBeVisible({ timeout: 5000 });
  });
});
