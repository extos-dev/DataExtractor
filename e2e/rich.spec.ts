import { test, expect } from './extension-fixture';

test('extension injects and detects on rich fixture', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/rich-page.html');
  await page.waitForTimeout(3000);
  const host = await page.evaluate(() => !!document.getElementById('tabwize-overlay-host'));
  expect(host).toBe(true);
});
