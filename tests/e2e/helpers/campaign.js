import { expect } from '@playwright/test';

export async function setAutoArrange(page, enabled) {
  const button = page.getByRole('button', { name: 'Arrange now', exact: true });
  await expect(button).toBeEnabled();
  if ((await button.getAttribute('aria-pressed')) !== String(enabled)) await button.click();
  await expect(button).toHaveAttribute('aria-pressed', String(enabled));
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
}
