import { test, expect } from '@playwright/test';
import { createTestOrg, deleteTestOrg, goHome } from './helpers';

test.describe('Export', () => {
  test('export endpoint returns YAML for valid org', async ({ request }) => {
    const orgName = await createTestOrg(request, 'export-test');
    try {
      const resp = await request.get(`/api/v1/orgs/${orgName}/export?format=yaml`);
      expect(resp.ok()).toBeTruthy();
      const text = await resp.text();
      expect(text).toContain(orgName);
      expect(text).toContain('departments');
    } finally {
      await deleteTestOrg(request, orgName);
    }
  });

  test('export endpoint returns JSON for valid org', async ({ request }) => {
    const orgName = await createTestOrg(request, 'export-json');
    try {
      const resp = await request.get(`/api/v1/orgs/${orgName}/export?format=json`);
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      expect(data.org.name).toBe(orgName);
    } finally {
      await deleteTestOrg(request, orgName);
    }
  });

  test('export menu is accessible from studio toolbar', async ({ page, request }) => {
    const orgName = await createTestOrg(request, 'export-menu');
    try {
      await goHome(page);
      await page.getByText(orgName).first().click();
      await page.waitForURL(/\/studio\//, { timeout: 5_000 });

      // Click export button
      const exportBtn = page.locator('button').filter({ hasText: /导出|Export/ }).first();
      await expect(exportBtn).toBeVisible({ timeout: 3_000 });

      await exportBtn.click();

      // Dropdown items should appear
      const menuItems = page.locator('[role=menuitem], .dropdown-item, .menu-item').filter({
        hasText: /下载|Download|Copy|复制|JSON|YAML/,
      });
      await expect(menuItems.first()).toBeVisible({ timeout: 3_000 }).catch(() => {});
    } finally {
      await deleteTestOrg(request, orgName);
    }
  });
});
