import { test, expect } from '@playwright/test';

test('nested outlet navigation preserves market, campaign and filter state, with back and reload', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?market=UK');
  await expect(page).toHaveURL(/\/campaign\?market=UK$/);
  await expect(page.getByRole('combobox', { name: 'Active market' })).toHaveValue('UK');
  await page.getByLabel('Headline', { exact: true }).fill('A ROUTED CAMPAIGN');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Find a format' }).fill('320');
  await expect(page.locator('.banner-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Assets & references', exact: true }).click();
  await expect(page).toHaveURL(/\/assets\?market=UK$/);
  await expect(
    page.getByRole('heading', { name: 'Assets & references', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.reference-card')).toHaveCount(8);
  await page.screenshot({ path: testInfo.outputPath('assets-page.png'), fullPage: true });
  await page.goBack();
  await expect(page.getByLabel('Headline', { exact: true })).toHaveValue('A ROUTED CAMPAIGN');
  await expect(page.getByRole('textbox', { name: 'Find a format' })).toHaveValue('320');
  await page.getByRole('button', { name: 'Blueprint library 8', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Active market' })).toHaveValue('UK');
  await expect(page.getByRole('heading', { name: 'Blueprint library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Campaign studio', exact: true }).click();
  await expect(page.getByLabel('Headline', { exact: true })).toHaveValue('A ROUTED CAMPAIGN');
  expect(errors).toEqual([]);
});

test('editor deep links select their own market and unknown routes have a recovery action', async ({
  page,
}) => {
  await page.goto('/campaign/UK-320x50/edit');
  await expect(page.getByRole('heading', { name: 'Edit banner UK / 320 × 50' })).toBeVisible();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const bp = JSON.parse(await page.locator('.json-editor').inputValue());
  expect(bp.marketId).toBe('UK');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Save banner' }).click();
  await expect(page).toHaveURL(/\/campaign\?market=UK$/);
  await expect(page.getByRole('combobox', { name: 'Active market' })).toHaveValue('UK');
  await page.goto('/blueprints/FI-300x250/edit');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Edit blueprint FI / 300 × 250' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to blueprint', exact: true }).click();
  await expect(page).toHaveURL(/\/blueprints\/FI-300x250\?market=FI$/);
  await page.getByRole('button', { name: 'Back to blueprints' }).click();
  await expect(page).toHaveURL(/\/blueprints\?market=FI$/);
  await page.goto('/campaign/does-not-exist/edit');
  await expect(page.getByRole('heading', { name: 'Banner not found' })).toBeVisible();
  await page.getByRole('button', { name: 'Open campaign studio' }).click();
  await expect(page.locator('.banner-card')).toHaveCount(8);
  await page.goto('/unknown-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('button', { name: 'Open campaign studio' }).click();
  await expect(page.locator('.banner-card')).toHaveCount(8);
});
