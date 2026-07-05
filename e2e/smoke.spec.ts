import { test, expect } from '@playwright/test';

test.describe('IPOFins smoke', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/IPOFins/i);
    await expect(page.locator('header')).toBeVisible();
  });

  test('IPO hub loads', async ({ page }) => {
    await page.goto('/ipo');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('SIP calculator loads', async ({ page }) => {
    await page.goto('/tools/sip-calculator');
    await expect(page.getByRole('heading', { name: /SIP Calculator/i })).toBeVisible();
  });

  test('mutual funds hub loads', async ({ page }) => {
    await page.goto('/mutual-funds');
    await expect(page).toHaveTitle(/Mutual Fund/i);
  });

  test('smart money hub loads', async ({ page }) => {
    await page.goto('/mutual-funds/smart-money');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('portfolio overlap checker loads', async ({ page }) => {
    await page.goto('/mutual-funds/portfolio-overlap-checker');
    await expect(page).toHaveTitle(/Overlap/i);
  });

  test('manifest.json is valid', async ({ request }) => {
    const res = await request.get('/manifest.json');
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.name).toContain('IPOFins');
  });
});
