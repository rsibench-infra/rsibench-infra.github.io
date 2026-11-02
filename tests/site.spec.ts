import { test, expect } from '@playwright/test';
import snapshot from '../data/leaderboard.json';

test('renders the exact snapshot and interactive task explorer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'RSIBench-Infra', exact: true })).toBeVisible();
  await expect(page.locator('.model-card')).toHaveCount(snapshot.rows.length);
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await expect(page.locator('.score')).toHaveCount(160);
  const scores = await page.locator('.score').allTextContents();
  const expected = snapshot.rows[0].tasks.flatMap((_, i) => snapshot.rows.map(m => m.tasks[i].reward === null ? '—' : `${m.tasks[i].reward!.toFixed(2)}×`));
  expect(scores).toEqual(expected);
  await page.getByRole('tab', { name: 'Median speedup', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Median speedup', exact: true })).toHaveAttribute('data-state', 'active');
  await page.getByRole('tab', { name: 'Training · 4', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await page.getByRole('textbox', { name: 'Search tasks' }).fill('OPD');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'GPT-6 Astra', exact: true }).click();
  await expect(page.locator('.score')).toHaveCount(7);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.score')).toHaveCount(160);
  await page.locator('.score').first().click();
  await expect(page.getByRole('status')).toContainText('2.107635×');
  await page.getByRole('button', { name: 'Close trajectory' }).click();
  await page.getByRole('textbox', { name: 'Search tasks' }).fill('not-a-real-task');
  await expect(page.getByText('No results match your selection.', { exact: false })).toBeVisible();
  const downloadHref = await page.getByRole('link', { name: 'Download results' }).getAttribute('href');
  const response = await page.request.get(downloadHref!);
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual(snapshot);
  expect(errors).toEqual([]);
});

test('fits mobile and desktop without page overflow', async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./');
    await page.locator('.model-card').first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: `artifacts/site-${width}.png`, fullPage: true });
  }
});
