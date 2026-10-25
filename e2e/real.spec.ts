import { test, expect } from './extension-fixture';

test('extension injects on example.com', async ({ page }) => {
  await page.goto('https://example.com');
  await page.waitForTimeout(4000);
  const host = await page.evaluate(() => !!document.getElementById('tabwize-overlay-host'));
  expect(host).toBe(true);
});
