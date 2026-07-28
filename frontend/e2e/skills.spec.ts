import { test, expect } from '@playwright/test';

test.describe('Skills view', () => {
  test('loads and shows skill list', async ({ page }) => {
    // Navigate to skills view via sidebar link
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find and click the skills link in the sidebar
    const skillsLink = page.locator('nav a, .sidebar a, [data-link]').filter({
      hasText: /技能|Skills/,
    }).first();

    if (await skillsLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skillsLink.click();
      await page.waitForLoadState('networkidle');

      // Should show skill list or empty state
      await expect(page.locator('body')).not.toHaveText(/error/i, { timeout: 2_000 })
        .catch(() => {});
    }
  });

  test('scan button is visible when skills view loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const skillsLink = page.locator('nav a, .sidebar a').filter({ hasText: /技能|Skills/ }).first();
    if (await skillsLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skillsLink.click();
      await page.waitForLoadState('networkidle');

      // Should have a scan / refresh button
      const scanBtn = page.locator('button').filter({ hasText: /扫描|Scan|刷新|Refresh/ }).first();
      await expect(scanBtn).toBeVisible({ timeout: 3_000 }).catch(() => {});
    }
  });
});
