import { test, expect } from '@playwright/test';

test.skip(process.env.ATTACHMENTS_ENABLED !== 'false', 'Run with npm run test:e2e:text-only.');

test('text-only form explains disabled attachments and submits descriptions as JSON', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#attachments-unavailable')).toBeVisible();
  await expect(page.locator('#files')).toBeDisabled();
  await expect(page.locator('#attachment-fields')).toBeHidden();
  await page.locator('#description').fill('Synthetic browser text-only report');
  const sent = page.waitForRequest(request => request.url().endsWith('/api/form/new'));
  await page.locator('#submit').click();
  const request = await sent;
  expect(request.headers()['content-type']).toContain('application/json');
  expect(request.postDataJSON()).toEqual({ description: 'Synthetic browser text-only report' });
  await expect(page.locator('#success')).toBeVisible();
});

test('failed text-only submission keeps attachments disabled and permits retry', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#submit')).toBeEnabled();
  await page.locator('#description').fill('Synthetic retry without attachments');
  await page.route('**/api/form/new', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic unavailable response' }) }), { times: 1 });
  await page.locator('#submit').click();
  await expect(page.locator('#error')).toContainText('Synthetic unavailable');
  await expect(page.locator('#files')).toBeDisabled();
  await expect(page.locator('#attachments-unavailable')).toBeVisible();
  await page.locator('#submit').click();
  await expect(page.locator('#success')).toBeVisible();
});
