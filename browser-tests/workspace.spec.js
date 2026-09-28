import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('Behavior Watch follows a refactor, exports evidence and persists across reloads', async ({ page }, testInfo) => {
  const failures = []; page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Investigate the refactor' }).click();
  await expect(page.locator('.card-title').first()).toHaveText('pairDevice');
  await page.getByRole('button', { name: 'Watch behavior', exact: true }).first().click();
  await expect(page.locator('#watch-query')).toHaveValue('awaits policyCheck');
  await page.getByRole('button', { name: 'Save and check' }).click();
  await expect(page.locator('.watch-summary')).toHaveText('Regression: v1 → v2 · Restoration: v2 → v3');
  await expect(page.locator('.watch-state')).toHaveText(['v1 · Holds', 'v2 · Broken', 'v3 · Holds']);
  await page.getByRole('button', { name: 'v1 · Holds', exact: true }).click();
  await expect(page.locator('#inspector-title')).toContainText('connectDevice');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence' }).click();
  const download = await downloadEvent;
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(report.schema).toBe('codestrata.behavior-watch.v1'); expect(report.points[1].status).toBe('contradicted');
  await page.reload(); await expect(page.locator('.watch-summary')).toContainText('Restoration');
  await page.getByRole('button', { name: 'Recheck', exact: true }).click();
  await expect(page.locator('.watch-summary')).toContainText('Regression');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.locator('#behavior-watch').screenshot({ path: testInfo.outputPath('behavior-watch.png'), animations: 'disabled' });
  await page.route('**/api/watch', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Pinned source has changed. Search again.' }) }));
  await page.getByRole('button', { name: 'Recheck', exact: true }).click();
  await expect(page.locator('.watch-error')).toContainText('Pinned source has changed');
  await expect(page.getByRole('button', { name: 'Export evidence' })).toBeDisabled();
  await expect(page.locator('.watch-summary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.reload(); await expect(page.locator('#behavior-watch')).toBeVisible();
  await expect(page.locator('.watch-card')).toHaveCount(0); expect(failures).toEqual([]);
});

test('investigate a refactor, inspect history and navigate an imported helper', async ({ page }, testInfo) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.goto('/');
  await expect(page.locator('.card-title').first()).toHaveText('openBluetooth');
  await expect(page.locator('#status-text')).toContainText('25 snippets');
  await page.getByRole('button', { name: 'Investigate the refactor' }).click();
  await expect(page.locator('.card-title').first()).toHaveText('pairDevice');
  await expect(page.locator('.lineage-note').first()).toContainText('Inferred rename');
  await expect(page.locator('.contrast-other').first()).toContainText('await');
  await expect(page.locator('#trace')).toContainText('Check competing versions');
  await page.getByRole('button', { name: 'Inspect connectDevice at v1' }).click();
  await expect(page.locator('#inspector-title')).toHaveText('connectDevice · v1');
  await expect(page.locator('#inspector-body')).toContainText('devices/connect.js:3');
  await page.getByRole('button', { name: 'Close source inspector' }).click();
  await expect(page.locator('#snippet-inspector')).toBeHidden();
  await page.locator('.connection-link').filter({ hasText: 'policyCheck' }).first().click();
  await expect(page.locator('#inspector-title')).toHaveText('policyCheck · v2');
  await expect(page.locator('#inspector-body')).toContainText('requestConsent');
  await page.getByRole('button', { name: 'Close source inspector' }).click();
  await page.getByRole('button', { name: 'Explain version filtering' }).click();
  await expect(page.locator('#help-title')).toHaveText('The right code. In the right version.');
  const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('main, header, footer, .workspace-grid, .results-region, .insight-sidebar')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).map(node => node.className || node.tagName) }));
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport + 1);
  await page.screenshot({ path: testInfo.outputPath('workspace.png'), fullPage: true, animations: 'disabled' });
  expect(failures).toEqual([]);
});

test('version filtering, exact deeplink search, and reduced motion remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.card-title').first()).toHaveText('openBluetooth');
  await expect(page.locator('#motion-toggle')).toBeDisabled();
  await page.locator('#query').fill('Where is the settings://device deeplink used?');
  await page.locator('#submit').click();
  await expect(page.locator('.card-title').first()).toHaveText('launchDevice');
  await page.locator('#version').selectOption('v3');
  await expect(page.locator('.version-tag').first()).toHaveText('v3');
  for (const version of await page.locator('.version-tag').allTextContents()) expect(version).toBe('v3');
  await page.locator('#mode').selectOption('hybrid');
  await expect(page.locator('#metric-supported')).toHaveText('0');
  await expect(page.locator('#error')).toBeHidden();
});
