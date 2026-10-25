import { test, expect } from './extension-fixture';

test('extension injects on coinlore all coins', async ({ page }) => {
  await page.goto('https://www.coinlore.com/all_coins');
  await page.waitForTimeout(6000);
  const host = await page.evaluate(() => !!document.getElementById('tabwize-overlay-host'));
  expect(host).toBe(true);
});
