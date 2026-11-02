import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import snapshot from '../data/leaderboard.json';
import manifest from '../public/data/trajectories/index.json';

const labels: Record<string, string> = { 'gpt-6-astra': 'GPT-6 Astra', 'claude-opus-5-5': 'Claude Opus 5.5', 'glm-5.3': 'GLM-5.3' };
const first = manifest.entries[0];
const original = JSON.parse(gunzipSync(readFileSync(`public/data/trajectories/${first.file}`)).toString());

test('all 160 cells bind to the score snapshot and intact original ATIF artifacts', () => {
  expect(manifest.leaderboard_sha256).toBe(createHash('sha256').update(readFileSync('data/leaderboard.json')).digest('hex'));
  expect(manifest.entries).toHaveLength(160);
  expect(new Set(manifest.entries.map(e => `${e.model}/${e.task}`)).size).toBe(160);
  for (const row of snapshot.rows) for (const cell of row.tasks) {
    const entry = manifest.entries.find(e => e.model === row.model && e.task === cell.task)!;
    expect(entry).toBeTruthy(); expect(entry.reward).toBe(cell.reward); expect(entry.score_status).toBe(cell.status);
    if (entry.available) {
      const bytes = gunzipSync(readFileSync(`public/data/trajectories/${entry.file}`));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      const data = JSON.parse(bytes.toString());
      expect(data.steps).toHaveLength(entry.steps!);
      expect(bytes.length).toBe(entry.bytes);
    } else {
      expect(entry.reason).toBeTruthy();
      if (entry.log_file) {
        const log = gunzipSync(readFileSync(`public/data/trajectories/${entry.log_file}`));
        expect(createHash('sha256').update(log).digest('hex')).toBe(entry.log_sha256);
        expect(log.length).toBe(entry.log_bytes);
      }
    }
  }
});

test('real trajectory uses library bubbles, complete steps, tools, search, paging and raw download', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', r => { if (r.url().includes('/trajectories/')) requests.push(r.url()); });
  await page.goto('./');
  await page.locator('.score').first().waitFor();
  expect(requests).toHaveLength(0);
  await page.locator('.score').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.ant-bubble')).toHaveCount(20);
  await expect(dialog.locator('.trace-markdown').first()).toContainText('Optimize');
  await expect(dialog.getByText('SHA-256 verified.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Tool · todowrite', exact: true }).first().click();
  await expect(dialog.locator('pre').filter({ hasText: 'Record budget, inspect the baseline' }).first()).toBeVisible();
  await dialog.getByTitle('2', { exact: true }).click();
  await expect(dialog.locator('.trace-step-label').first()).toContainText('Step 21');
  const lastStep = original.steps.at(-1);
  await dialog.getByRole('textbox', { name: 'Search trajectory' }).fill(lastStep.timestamp);
  await expect(dialog.locator('.trace-step-label').last()).toContainText(`Step ${lastStep.step_id}`);
  await dialog.getByRole('textbox', { name: 'Search trajectory' }).fill('no-such-trajectory-content-123');
  await expect(dialog.getByText('No steps match your search.')).toBeVisible();
  const href = await dialog.getByRole('link', { name: 'Original JSON (.gz)' }).getAttribute('href');
  const response = await page.request.get(href!);
  expect(response.ok()).toBeTruthy();
  expect(JSON.parse(gunzipSync(await response.body()).toString())).toEqual(original);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.score').first()).toBeFocused();
  expect(errors).toEqual([]);
});

test('missing artifacts are explicit and download failures can be retried', async ({ page }) => {
  await page.goto('./');
  for (const entry of manifest.entries.filter(e => !e.available)) {
    const row = snapshot.rows.find(r => r.model === entry.model)!;
    await page.getByRole('button', { name: `${labels[row.display_name]}, ${entry.task},`, exact: false }).click();
    await expect(page.getByRole('dialog').getByText('Trajectory unavailable', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Original JSON (.gz)' })).toHaveCount(0);
    if (entry.log_file) {
      await page.getByRole('button', { name: 'Read original Agent log', exact: true }).click();
      await expect(page.getByRole('dialog').locator('pre')).toContainText('Cannot connect to API');
      await expect(page.getByRole('link', { name: 'Original agent log (.gz)' })).toBeVisible();
    }
    await page.keyboard.press('Escape');
  }
  await page.route('**/trajectories/*.json.gz', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.locator('.score').first().click();
  await expect(page.getByText('Trajectory request failed (503).')).toBeVisible();
  await page.unroute('**/trajectories/*.json.gz');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.ant-bubble')).toHaveCount(20);
});

test('trajectory fits mobile and desktop and keeps tools collapsed initially', async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./');
    await page.locator('.score').first().click();
    await expect(page.locator('.ant-bubble')).toHaveCount(20);
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    expect(await page.locator('.trace-messages').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    await expect(page.getByRole('button', { name: 'Tool · todowrite', exact: true }).first()).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: `artifacts/trajectory-${width}.png` });
  }
});


test('a checksum mismatch is reported without displaying the wrong conversation', async ({ page }) => {
  const other = manifest.entries.find(e => e.available && e.sha256 !== first.sha256)!;
  await page.route(`**/trajectories/${first.file}`, route => route.fulfill({
    contentType: 'application/gzip', body: readFileSync(`public/data/trajectories/${other.file}`),
  }));
  await page.goto('./');
  await page.locator('.score').first().click();
  await expect(page.getByText('Trajectory checksum does not match the exported record.')).toBeVisible();
  await expect(page.locator('.ant-bubble')).toHaveCount(0);
});
