import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import type { Worker } from 'playwright-core';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const distPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'extension');

export const test = base.extend<{
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  openSidePanel: (chromePage: Page, tab?: string) => Promise<Page>;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${distPath}`,
        `--load-extension=${distPath}`,
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
        '--no-first-run',
        '--no-default-browser-check'
      ]
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
    await use(serviceWorker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
  openSidePanel: async ({ context, extensionId }, use) => {
    await use(async (page: Page, tab = 'Page'): Promise<Page> => {
      const panel = await context.newPage();
      await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await page.bringToFront();
      await panel.reload();
      await page.bringToFront();
      if (tab !== 'Page') {
        await panel.getByRole('button', { name: new RegExp(tab, 'i') }).click();
      }
      return panel;
    });
  }
});

export { expect };
export type { Page, BrowserContext };
