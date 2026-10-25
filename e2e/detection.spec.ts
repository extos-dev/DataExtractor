import { test, expect } from './extension-fixture';

test('auto-detects table on fixture page', async ({ page, openSidePanel }) => {
  await page.goto('http://127.0.0.1:4173/table-page.html');
  const panel = await openSidePanel(page, 'Page');
  await expect(panel.getByText(/table/i)).toBeVisible({ timeout: 15000 });
});
