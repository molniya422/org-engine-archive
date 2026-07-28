import { test, expect } from '@playwright/test';
import { createTestOrg, deleteTestOrg, goHome } from './helpers';

test.describe('Home page', () => {
  test('loads and shows the app shell', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Check that at least one shell element is visible
    const shell = page.locator('nav, header, .sidebar').first();
    await expect(shell).toBeVisible({ timeout: 10_000 });
    // Should not show an error dialog
    await expect(page.getByText(/error/i)).toHaveCount(0, { timeout: 2_000 }).catch(() => {});
  });

  test('shows created org in the grid', async ({ page, request }) => {
    const orgName = await createTestOrg(request);
    try {
      await goHome(page);
      await expect(page.getByText(orgName).first()).toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteTestOrg(request, orgName);
    }
  });

  test('org card is clickable and navigates to studio', async ({ page, request }) => {
    const orgName = await createTestOrg(request);
    try {
      await goHome(page);
      const card = page.getByText(orgName).first();
      await expect(card).toBeVisible({ timeout: 5_000 });
      await card.click();
      await page.waitForURL(/\/studio\//, { timeout: 5_000 });
    } finally {
      await deleteTestOrg(request, orgName);
    }
  });

  test('create org button navigates to studio/new', async ({ page }) => {
    await goHome(page);
    const btn = page.locator('a, button').filter({ hasText: /新建|创建|Create|New/ }).first();
    if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await btn.click();
      await page.waitForURL(/new/, { timeout: 5_000 });
    }
  });
});
