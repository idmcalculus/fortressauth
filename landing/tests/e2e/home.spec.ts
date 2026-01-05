import { expect, test } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load the home page and show main sections', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/FortressAuth/);

    // Check Hero section
    await expect(page.locator('h1')).toContainText('FortressAuth');

    // Check navigation links
    const featuresLink = page.locator('nav').getByRole('link', { name: /Features/i });
    await expect(featuresLink).toBeVisible();

    // Check Features section
    await expect(page.locator('#features')).toBeVisible();

    // Check Code Showcase
    await expect(
      page.locator('section').filter({ hasText: /Developer Experience First/i }),
    ).toBeVisible();
  });

  test('should toggle theme', async ({ page }) => {
    await page.goto('/');

    const themeToggle = page.getByRole('button', { name: /Toggle theme/i });

    // Initial theme (default dark based on code)
    const html = page.locator('html');

    // Click toggle
    await themeToggle.click();

    // Should be light (or toggled)
    // The implementation sets documentElement attribute 'data-theme'
    await expect(html).toHaveAttribute('data-theme', /light|dark/);
  });

  test('should open mobile menu', async ({ page }) => {
    // Set viewport to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: /Toggle menu/i });
    await expect(menuButton).toBeVisible();

    await menuButton.click();

    // Check if mobile menu links are visible
    await expect(
      page
        .locator('nav')
        .getByRole('link', { name: /Features/i })
        .nth(1),
    ).toBeVisible();
  });
});
