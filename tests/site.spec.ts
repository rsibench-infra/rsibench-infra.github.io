import { test, expect } from '@playwright/test';
import snapshot from '../data/leaderboard.json';
import liteSet from '../data/lite-set.json';

test('renders the exact snapshot and interactive task explorer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'RSIBench-Infra', exact: true })).toBeVisible();
  await expect(page.locator('.lite-comparison .recharts-wrapper')).toHaveCount(1);
  await expect(page.locator('#results > .table-scroll tbody tr')).toHaveCount(20);
  await expect(page.locator('.score')).toHaveCount(snapshot.rows.length * 20);
  const scores = await page.locator('.speedup-value').allTextContents();
  const expected = snapshot.rows[0].tasks.flatMap((_, i) => snapshot.rows.map(m => m.tasks[i].reward === null ? '—' : `${m.tasks[i].reward!.toFixed(2)}×`));
  expect(scores).toEqual(expected);
  const ranked = [...liteSet.models].sort((a,b)=>b.mean_score-a.mean_score);
  expect(await page.locator('.lite-chart .recharts-label-list text').allTextContents()).toEqual(ranked.map(model=>model.mean_score.toFixed(3)));
  const expectedLite = liteSet.rows.flatMap(row => ranked.map(model => model.tasks.find(task => task.task === row.task_id)?.score.toFixed(3) ?? '—'));
  await expect(page.locator('.lite-comparison .recharts-bar')).toHaveCount(liteSet.models.length);
  for (const row of liteSet.rows) await expect(page.locator('.lite-comparison').getByText(row.task, {exact: true})).toBeVisible();
  expect(await page.locator('.lite-score-agent').allTextContents()).toEqual(expectedLite);
  const chart = page.locator('.lite-comparison');
  await chart.locator('svg[role="application"]').focus();
  await page.keyboard.press('ArrowLeft');
  for (const row of liteSet.rows) {
    await expect(chart.locator('.recharts-tooltip-label')).toHaveText(row.task);
    await expect(chart.locator('.recharts-tooltip-item-value')).toHaveText(ranked.map(model => model.tasks.find(task => task.task === row.task_id)!.score.toFixed(6)));
    await page.keyboard.press('ArrowRight');
  }

  await page.getByRole('tab', { name: 'Training · 4', exact: true }).click();
  await expect(page.locator('#results > .table-scroll tbody tr')).toHaveCount(4);
  await page.getByRole('textbox', { name: 'Search tasks' }).fill('OPD');
  await expect(page.locator('#results > .table-scroll tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'GPT-6 Astra', exact: true }).click();
  await expect(page.locator('.score')).toHaveCount(snapshot.rows.length - 1);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.score')).toHaveCount(snapshot.rows.length * 20);
  await page.getByRole('button', { name: 'GPT-6 Astra, infer-deepseekv4flash-284b,', exact: false }).click();
  await expect(page.locator('.trace-summary')).toContainText(`${snapshot.rows.find(r => r.display_name === 'gpt-6-astra')!.tasks[0].reward!.toFixed(6)}×`);
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
    await page.locator('.lite-comparison .recharts-surface').first().waitFor();
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
  await expect(page.locator('#lite-set .lite-chart .model-axis-tick image')).toHaveCount(7);
  await expect(page.locator('.lite-model-legend > span')).toHaveCount(7);
  await expect(page.locator('#leaderboard .evaluation-note')).toContainText('10 of 20 tasks');
  const claude = snapshot.rows.find(r => r.display_name === 'claude-opus-5-5')!;
  expect(claude.scored).toBe(10);
  expect(claude.faster_rate_percent).toBe(80);
  expect(claude.tasks.filter(t => t.status === "not_tested")).toHaveLength(10);
  await page.getByRole('button', { name: 'Claude Opus 5.5, infer-llada2p1mini-16b,', exact: false }).click();
  await expect(page.locator('.trace-summary')).toContainText('6.106245×');
  await expect(page.locator('.trace-provenance')).toHaveCount(0);
  await expect(page.locator('.ant-bubble')).toHaveCount(20);
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
  await expect(page.locator('.lite-score-table')).toHaveCount(0);
  await expect(page.locator('.lite-comparison .recharts-reference-line')).toHaveCount(2);
  await expect(page.locator('.lite-workload-heading')).toContainText('one shared scale');
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
  const glm = snapshot.rows.find(r => r.display_name === 'glm-5.3')!.tasks.find(t => t.task === 'infer-qwen3ttsbase-1p7b')!;
  await expect(page.locator('.trace-summary')).toContainText(`${glm.reward!.toFixed(6)}×`);
  await expect(page.locator('.trace-provenance')).toHaveCount(0);
  await expect(page.locator('.ant-bubble')).toHaveCount(20);
});


test('SOL metrics use bounded scores and explicit evaluation denominators', async ({ page }) => {
  await page.goto('./');
  expect(await page.locator('.sol-score-value').allTextContents()).toEqual(snapshot.rows[0].tasks.flatMap((_, i) => snapshot.rows.map(m => m.tasks[i].sol_score.toFixed(3))));
  await page.getByRole('tab', { name: 'Mean SOL score', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Mean SOL score', exact: true })).toHaveAttribute('data-state', 'active');
  const ranked = [...snapshot.rows].sort((a,b) => b.mean_sol_score - a.mean_sol_score);
  expect(await page.locator('.ranking-chart .recharts-label-list text').allTextContents()).toEqual(ranked.map(r => r.mean_sol_score.toFixed(3)));
  await expect(page.locator('.metric-footnote')).toContainText('all 20');
  await expect(page.locator('.evaluation-note')).toContainText("API Error: 400 This request may violate the Claude model's safety policy and has been terminated early.");
  for (const row of snapshot.rows) {
    expect(row.mean_sol_score).toBeCloseTo(row.tasks.reduce((sum,t) => sum+t.sol_score, 0) / row.aggregation_task_count, 12);
    for (const cell of row.tasks) {
      expect(cell.sol_score).toBeGreaterThanOrEqual(0);
      expect(cell.sol_score).toBeLessThanOrEqual(1);
      if (cell.reward === null || cell.reward === 0) expect(cell.sol_score).toBe(0);
    }
    const lite = liteSet.models.find(r => r.model === row.model)!;
    expect(lite.mean_score).toBeCloseTo(lite.tasks.reduce((sum,t) => sum+t.score, 0) / lite.aggregation_task_count, 12);
    for (const cell of lite.tasks) expect(cell.score).toBe(row.tasks.find(t => t.task === cell.task)!.sol_score);
  }
  await page.getByRole('tab', { name: 'Median speedup', exact: true }).click();
  await expect(page.locator('.ranking-chart')).toHaveAttribute('aria-label', /median speedup/);
});


test('Claude uses partial coverage and visibly marked faded bars in both leaderboards', async ({ page }) => {
  const claude = snapshot.rows.find(r => r.display_name === 'claude-opus-5-5')!;
  const lite = liteSet.models.find(r => r.display_name === 'claude-opus-5-5')!;
  expect(claude.aggregation_task_count).toBe(10);
  expect(lite.aggregation_task_count).toBe(3);
  expect(claude.mean_sol_score).toBeCloseTo(0.7110164897397678, 12);
  expect(lite.mean_score).toBeCloseTo(0.7977152621044545, 12);
  await page.goto('./');
  for (const selector of ['.lite-chart', '.ranking-chart']) {
    await expect(page.locator(`${selector} .partial-evaluation-bar`)).toHaveCount(1);
    await expect(page.locator(`${selector} .partial-bar-marker`)).toHaveText('†');
    await expect(page.locator(`${selector} .partial-evaluation-bar path`)).toHaveAttribute('fill-opacity', '0.38');
    await expect(page.locator(`${selector} .partial-evaluation-bar path`)).toHaveAttribute('stroke-dasharray', '3 2');
  }
  await expect(page.locator('#lite-set .partial-evaluation-note')).toContainText('3/5 tasks tested');
  await expect(page.locator('#leaderboard .partial-evaluation-note')).toContainText('10/20 tasks tested');
  await expect(page.locator('.lite-comparison .partial-bar-marker')).toHaveCount(3);
  for (const metric of ['Median speedup', 'Mean SOL score']) {
    await page.getByRole('tab', { name: metric, exact: true }).click();
    await expect(page.locator('.ranking-chart .partial-bar-marker')).toHaveText('†');
  }
});
