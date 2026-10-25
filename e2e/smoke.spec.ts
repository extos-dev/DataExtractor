import { test, expect } from '@playwright/test';

test('fixture page loads', async ({ page }) => {
  await page.goto('file://' + process.cwd() + '/tests/fixtures/article/wordpress-basic/page.html');
  await expect(page).toHaveTitle(/.*/);
});
