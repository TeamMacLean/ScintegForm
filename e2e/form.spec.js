import { test, expect } from '@playwright/test';

test('report with files succeeds without browser errors or third-party requests', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:4317/')) external.push(req.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Submit report' })).toBeEnabled();
  await page.getByLabel('Description of the incident').fill('Synthetic browser test report.');
  await page.locator('#files').setInputFiles([{ name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic file evidence') }]);
  await expect(page.getByRole('button', { name: 'Remove evidence.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByRole('heading', { name: 'Report received', exact: true })).toBeVisible();
  await expect(page.locator('#reference')).toHaveText(/^[a-f0-9]{24}$/);
  await expect(page.locator('#description')).toHaveValue('');
  expect(errors).toEqual([]); expect(external).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
});

test('remove and reselect the same file; reject invalid files without silently dropping them', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#files')).toBeEnabled();
  const file = { name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from('evidence') };
  await page.locator('#files').setInputFiles([file]);
  await page.getByRole('button', { name: 'Remove evidence.txt' }).click();
  await page.locator('#files').setInputFiles([file]);
  await expect(page.locator('#file-list li')).toHaveCount(1);
  await page.locator('#files').setInputFiles([{ name: 'script.exe', mimeType: 'text/plain', buffer: Buffer.from('test') }]);
  await expect(page.getByRole('button', { name: 'Submit report' })).toBeDisabled();
  await expect(page.locator('#file-list')).toContainText('Unsupported file type');
  await page.getByRole('button', { name: 'Remove script.exe' }).click();
  await expect(page.getByRole('button', { name: 'Submit report' })).toBeEnabled();
});

test('network failure preserves contents and reuses the submission key on retry', async ({ page }) => {
  const keys = [];
  let fail = true;
  await page.route('**/api/form/new', async route => {
    keys.push(route.request().headers()['idempotency-key']);
    if (fail) { fail = false; await route.abort('failed'); } else await route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Description of the incident').fill('Keep this report after network failure');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByRole('alert')).toContainText('connection was interrupted');
  await expect(page.getByLabel('Description of the incident')).toHaveValue('Keep this report after network failure');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByRole('heading', { name: 'Report received', exact: true })).toBeVisible();
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});

test('blocks repeated clicks while the server processes a report', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  await page.route('**/api/form/new', async route => { calls++; await gate; await route.continue(); });
  await page.goto('/');
  await page.getByLabel('Description of the incident').fill('Double click test');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByRole('button', { name: 'Submit report' })).toBeDisabled();
  await expect(page.getByLabel('Description of the incident')).toBeDisabled();
  release();
  await expect(page.getByRole('heading', { name: 'Report received', exact: true })).toBeVisible();
  expect(calls).toBe(1);
});

test('help form is reachable on small screens and submits successfully', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Request help' }).click();
  await page.getByLabel('Subject').fill('Synthetic browser query');
  await page.getByLabel('Message', { exact: false }).fill('Help with a synthetic submission');
  await page.getByRole('button', { name: 'Send help request' }).click();
  await expect(page.getByRole('heading', { name: 'Help request received' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('service failure shows a useful error and keeps the report editable', async ({ page }) => {
  await page.route('**/api/form/new', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'File safety scanning is temporarily unavailable.' }) }));
  await page.goto('/');
  await page.getByLabel('Description of the incident').fill('Do not lose this');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByRole('alert')).toContainText('scanning is temporarily unavailable');
  await expect(page.getByLabel('Description of the incident')).toHaveValue('Do not lose this');
  await expect(page.getByRole('button', { name: 'Submit report' })).toBeEnabled();
});
