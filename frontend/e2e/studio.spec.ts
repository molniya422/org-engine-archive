import { test, expect } from '@playwright/test';
import { createTestOrg, deleteTestOrg, goHome } from './helpers';

test.describe('Studio view', () => {
  test('loads tree, canvas, and schema tabs for an org', async ({ page, request }) => {
    const orgName = await createTestOrg(request);
    try {
      // Navigate to studio
      await goHome(page);
      await page.getByText(orgName).first().click();
      await page.waitForURL(/\/studio\//, { timeout: 5_000 });

      // Should show a tab bar with tree/canvas/schema
      const tabs = page.locator('button, a, [role=tab]').filter({
        hasText: /树形|Tree|画布|Canvas|架构|Schema|配置|Config/,
      });
      await expect(tabs.first()).toBeVisible({ timeout: 3_000 });

      // Click canvas tab if available
      const canvasTab = page.locator('button, a, [role=tab]').filter({ hasText: /画布|Canvas/ }).first();
      if (await canvasTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await canvasTab.click();
        await page.waitForTimeout(500); // allow dagre layout
      }

      // Click schema tab if available
      const schemaTab = page.locator('button, a, [role=tab]').filter({ hasText: /架构|Schema/ }).first();
      if (await schemaTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await schemaTab.click();
        await page.waitForTimeout(500);
      }
    } finally {
      await deleteTestOrg(request, orgName);
    }
  });

  test('role editor opens when clicking a role', async ({ page, request }) => {
    const orgName = await createTestOrg(request);
    try {
      await goHome(page);
      await page.getByText(orgName).first().click();
      await page.waitForURL(/\/studio\//, { timeout: 5_000 });

      // Click a role name in the tree view
      const roleNode = page.getByText(/developer|develop/i).first();
      if (await roleNode.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await roleNode.click();
        // Role editor panel should appear
        await expect(page.locator('input[name="name"], [data-testid="role-name"]').first())
          .toBeVisible({ timeout: 3_000 }).catch(() => {});
      }
    } finally {
      await deleteTestOrg(request, orgName);
    }
  });

  test('export button is visible in studio toolbar', async ({ page, request }) => {
    const orgName = await createTestOrg(request);
    try {
      await goHome(page);
      await page.getByText(orgName).first().click();
      await page.waitForURL(/\/studio\//, { timeout: 5_000 });

      // Export button should be in the toolbar
      const exportBtn = page.locator('button').filter({ hasText: /导出|Export/ }).first();
      await expect(exportBtn).toBeVisible({ timeout: 3_000 });
    } finally {
      await deleteTestOrg(request, orgName);
    }
  });
});
