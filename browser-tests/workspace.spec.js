import { test, expect } from '@playwright/test';

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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
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
