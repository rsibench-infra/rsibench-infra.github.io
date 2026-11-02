import { test, expect } from '@playwright/test';
import snapshot from '../data/leaderboard.json';
import liteSet from '../data/lite-set.json';

test('renders the exact snapshot and interactive task explorer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'RSIBench-Infra', exact: true })).toBeVisible();
  await expect(page.locator('.lite-score-table tbody tr')).toHaveCount(snapshot.rows.length);
  await expect(page.locator('#results tbody tr')).toHaveCount(20);
  await expect(page.locator('.score')).toHaveCount(snapshot.rows.length * 20);
  const scores = await page.locator('.score').allTextContents();
  const expected = snapshot.rows[0].tasks.flatMap((_, i) => snapshot.rows.map(m => m.tasks[i].reward === null ? '—' : `${m.tasks[i].reward!.toFixed(2)}×`));
  expect(scores).toEqual(expected);
  const means = await page.locator('.lite-mean-cell').allTextContents();
  expect(means).toEqual([...liteSet.models].sort((a,b)=>b.mean_score-a.mean_score).map(model=>model.mean_score.toFixed(3)));
  await expect(page.locator('.lite-score-agent')).toHaveCount(liteSet.models.length * 5);
  await page.getByRole('tab', { name: 'Training · 4', exact: true }).click();
  await expect(page.locator('#results tbody tr')).toHaveCount(4);
  await page.getByRole('textbox', { name: 'Search tasks' }).fill('OPD');
  await expect(page.locator('#results tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'GPT-6 Astra', exact: true }).click();
  await expect(page.locator('.score')).toHaveCount(snapshot.rows.length - 1);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.score')).toHaveCount(snapshot.rows.length * 20);
  await page.locator('.score').first().click();
  await expect(page.locator('.trace-summary')).toContainText('2.107635×');
  await page.getByRole('button', { name: 'Close trajectory' }).click();
  await page.getByRole('textbox', { name: 'Search tasks' }).fill('not-a-real-task');
  await expect(page.getByText('No results match your selection.', { exact: false })).toBeVisible();
  await expect(page.locator('a[download]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /download/i })).toHaveCount(0);
  const response = await page.request.get('./data/lite-set.json');
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toEqual(liteSet);
  expect(errors).toEqual([]);
});

test('fits mobile and desktop without page overflow', async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./');
    await page.locator('.lite-score-table tbody tr').first().waitFor();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: `artifacts/site-${width}.png`, fullPage: true });
  }
});

test('benchmark order, model identities, selected result and publication data agree', async ({ page }) => {
  await page.goto('./');
  expect(await page.locator('main > section[id]').evaluateAll(nodes => nodes.map(n => n.id))).toEqual(['lite-set', 'leaderboard', 'results', 'about']);
  expect(await page.locator('header nav a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')))).toEqual(['#lite-set', '#leaderboard', '#results', '#about']);
  await expect(page.getByText('About these results', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Claude Opus 5', { exact: true })).toHaveCount(0);
  await expect(page.locator('#lite-set .model-axis-tick image')).toHaveCount(7);
  await expect(page.locator('#lite-set tbody .model-icon')).toHaveCount(7);
  await expect(page.locator('#leaderboard .evaluation-note')).toContainText('4 of 20 tasks');
  const claude = snapshot.rows.find(r => r.display_name === 'claude-opus-5-5')!;
  expect(claude.scored).toBe(16);
  expect(claude.faster_rate_percent).toBe(60);
  expect(claude.median_speedup).toBeCloseTo(1.143926886320688, 12);
  await page.getByRole('button', { name: 'Claude Opus 5.5, infer-kimik3-2p8t,', exact: false }).click();
  await expect(page.locator('.trace-summary')).toContainText('1.180446×');
  await expect(page.getByRole('dialog')).toContainText('271');
  await expect(page.locator('.ant-bubble')).toHaveCount(18);
  await page.keyboard.press('Escape');
  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  expect((await page.request.get(icon!)).ok()).toBeTruthy();
  const full = await page.request.get('./data/leaderboard.json');
  expect(await full.json()).toEqual(snapshot);
});

test('requested copy, agent-only Lite scores, linked formula and selected GLM trajectory', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header nav')).toContainText('01 / RSIBench-Infra-Lite');
  await expect(page.locator('header nav')).toContainText('02 / RSIBench-Infra');
  await expect(page.locator('.stats > div').last()).toHaveText('5Lite Set tasks');
  await expect(page.locator('.snapshot, .benchmark-names, .eyebrow')).toHaveCount(0);
  await expect(page.locator('.lite-score-table')).not.toContainText('Oracle');
  await expect(page.locator('.lite-score-table')).not.toContainText('SOL');
  await expect(page.locator('.lite-score-table')).toContainText('MEAN SCORE');
  await expect(page.locator('.chart-note .katex')).toBeVisible();
  await expect(page.getByRole('link', { name: 'SOL-ExecBench', exact: true })).toHaveAttribute('href', 'https://research.nvidia.com/benchmarks/sol-execbench');
  await expect(page.getByRole('link', { name: 'AISimulate', exact: true })).toHaveAttribute('href', 'https://github.com/ai-dynamo/aisimulate');
  for (const task of snapshot.rows.find(r => r.display_name === 'claude-opus-5-5')!.tasks.filter(t => t.reward === null)) {
    await expect(page.locator('.evaluation-note')).toContainText(task.task);
  }
  await expect(page.locator('.evaluation-note')).not.toContainText('#271');
  await expect(page.getByText('RAW VERIFIED SPEEDUP', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'RSIBench-Infra agent trajectory explorer.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'GLM-5.3, infer-qwen3ttsbase-1p7b,', exact: false }).click();
  await expect(page.locator('.trace-summary')).toContainText('Source: attempt 326');
  await expect(page.locator('.trace-summary')).toContainText('No verified score');
  await expect(page.getByText('SHA-256 verified.', { exact: false })).toBeVisible();
  await expect(page.locator('.ant-bubble')).toHaveCount(20);
});
