import { test, expect } from '@playwright/test';

test.describe('Workflow Editor', () => {
  test.beforeEach(async ({ page }) => {
    // Go to studio for a new org
    await page.goto('/studio/new');
    await page.waitForSelector('text=NewOrgForm', { timeout: 5000 }).catch(() => {});
    // Create basic org
    await page.fill('input[name="name"]', 'TestOrg').catch(() => {});
    await page.click('button:has-text("Create")').catch(() => {});
    await page.waitForTimeout(1000);
  });

  test('should display workflow tab in studio', async ({ page }) => {
    await page.goto('/studio/new');
    await page.waitForTimeout(2000);
    // Check workflow tab exists
    await expect(page.locator('text=Workflow').first()).toBeVisible();
  });

  test('should navigate to workflow tab and show canvas', async ({ page }) => {
    await page.goto('/studio/new');
    await page.waitForTimeout(2000);
    // Click workflow tab
    await page.locator('text=Workflow').first().click();
    await page.waitForTimeout(1000);
    // Canvas should be visible
    await expect(page.locator('.react-flow')).toBeVisible();
  });

  test('should show node draggable items in toolbar', async ({ page }) => {
    await page.goto('/studio/new');
    await page.waitForTimeout(2000);
    await page.locator('text=Workflow').first().click();
    await page.waitForTimeout(1000);
    // Check all node types are listed
    await expect(page.locator('text=Agent').first()).toBeVisible();
    await expect(page.locator('text=Skill').first()).toBeVisible();
    await expect(page.locator('text=Decision').first()).toBeVisible();
    await expect(page.locator('text=Parallel').first()).toBeVisible();
  });

  test('should show properties panel hint when no node selected', async ({ page }) => {
    await page.goto('/studio/new');
    await page.waitForTimeout(2000);
    await page.locator('text=Workflow').first().click();
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Select a node')).toBeVisible();
  });

  test('should show clear and save buttons', async ({ page }) => {
    await page.goto('/studio/new');
    await page.waitForTimeout(2000);
    await page.locator('text=Workflow').first().click();
    await page.waitForTimeout(1000);
    // Clear and Save buttons should exist
    await expect(page.locator('button:has-text("Clear")')).toBeVisible();
    await expect(page.locator('button:has-text("Save")')).toBeVisible();
  });

  test('should navigate to template library', async ({ page }) => {
    await page.goto('/templates');
    await page.waitForTimeout(2000);
    // Check template library loaded
    await expect(page.locator('text=Workflow Templates')).toBeVisible();
    await expect(page.locator('text=Org Scaffold').first()).toBeVisible();
  });

  test('should filter templates by category', async ({ page }) => {
    await page.goto('/templates');
    await page.waitForTimeout(2000);
    // Click the Audit tab
    await page.locator('button:has-text("Audit")').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Audit Run').first()).toBeVisible();
  });

  test('should load built-in templates', async ({ page }) => {
    await page.goto('/templates');
    await page.waitForTimeout(2000);
    // Check for built-in badge on at least one template
    await expect(page.locator('text=built-in').first()).toBeVisible();
  });

  test('should show sidebar navigation links', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Check for templates link in sidebar
    await expect(page.locator('aside').first()).toContainText('Templates');
  });

  test('should show theme toggle in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Theme toggle button should be visible in sidebar footer
    const sidebar = page.locator('aside').first();
    await expect(sidebar.locator('text=Dark').or(sidebar.locator('text=Light'))).toBeVisible();
  });
});
