import { test, expect } from '@playwright/test';

const OVERLAP_SLUG = '360-one-focused-fund';

test.describe('Fund overlap → holdings → back navigation', () => {
  test('View holdings preserves context and back link returns to overlap detail', async ({ page }) => {
    await page.goto(`/mutual-funds/fund-overlap/${OVERLAP_SLUG}?from=fund-overlap`);

    const viewHoldings = page.locator('.mf-overlap-holdings-link').first();
    await expect(viewHoldings).toBeVisible({ timeout: 30_000 });

    const holdingsHref = await viewHoldings.getAttribute('href');
    expect(holdingsHref).toContain('from=fund-overlap');
    expect(holdingsHref).toContain(`fundSlug=${OVERLAP_SLUG}`);

    await viewHoldings.click();
    await page.waitForURL(/\/mutual-funds\/fund\/.*-holdings/, { timeout: 30_000 });

    await expect(page.locator('h1')).toBeVisible({ timeout: 30_000 });

    const backLink = page.locator('#fund-list-back');
    await expect(backLink).toBeVisible();
    const backHref = await backLink.getAttribute('href');
    expect(backHref).toMatch(new RegExp(`/mutual-funds/fund-overlap/${OVERLAP_SLUG}`));

    await backLink.click();
    await page.waitForURL(new RegExp(`/mutual-funds/fund-overlap/${OVERLAP_SLUG}`), { timeout: 30_000 });
    await expect(page.locator('h1')).toContainText(/360 ONE Focused/i);
  });

  test('alias holdings redirect preserves fund-overlap query params', async ({ page, request }) => {
    const overlapRes = await request.get(`/mutual-funds/fund-overlap/${OVERLAP_SLUG}`);
    test.skip(!overlapRes.ok(), 'Overlap page not available in this build');

    await page.goto(`/mutual-funds/fund-overlap/${OVERLAP_SLUG}`);
    const viewHoldings = page.locator('.mf-overlap-holdings-link').first();
    await expect(viewHoldings).toBeVisible({ timeout: 30_000 });

    const holdingsHref = await viewHoldings.getAttribute('href');
    if (!holdingsHref) {
      test.skip();
      return;
    }

    const aliasProbe = holdingsHref.replace(
      /(\/mutual-funds\/fund\/)([^?]+)/,
      (_, prefix, slug) => `${prefix}${slug.replace(/-direct-plan-holdings$/, '-holdings').replace(/-holdings$/, '')}-holdings`,
    );

    if (aliasProbe === holdingsHref) test.skip();

    const response = await page.goto(aliasProbe);
    expect(response?.status()).toBeLessThan(400);

    const finalUrl = page.url();
    expect(finalUrl).toContain('from=fund-overlap');
    expect(finalUrl).toContain(`fundSlug=${OVERLAP_SLUG}`);

    const backHref = await page.locator('#fund-list-back').getAttribute('href');
    expect(backHref).toMatch(new RegExp(`/mutual-funds/fund-overlap/${OVERLAP_SLUG}`));
  });
});
