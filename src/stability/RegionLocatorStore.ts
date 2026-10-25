import { RegionLocator } from './types';
import { SelectorStabilizer } from './SelectorStabilizer';

/**
 * Persist-use-verify store: stabilize a detected region once, then relocate
 * it on later page visits and update per-region hit/miss reliability.
 */
export class RegionLocatorStore {
  private readonly stabilizer = new SelectorStabilizer();
  private readonly regions = new Map<string, RegionLocator>();

  /** Capture stable locators for a freshly detected region's element. */
  capture(
    key: string,
    kind: string,
    element: Element
  ): RegionLocator {
    const locators = this.stabilizer.stabilize(element);

    const existing = this.regions.get(key);
    const previousStats = existing?.stats ?? { hits: 0, misses: 0, reliability: 0 };

    const locator: RegionLocator = {
      regionId: key,
      kind,
      locators,
      stats: previousStats,
    };

    this.regions.set(key, locator);
    return locator;
  }

  get(key: string): RegionLocator | undefined {
    return this.regions.get(key);
  }

  all(): RegionLocator[] {
    return Array.from(this.regions.values());
  }

  forget(key: string): void {
    this.regions.delete(key);
  }

  /**
   * Relocate a captured region inside a (possibly reloaded) root element.
   * Locators are tried in stored order — first match wins. The result is
   * recorded toward the region's reliability when `record` is true.
   */
  relocate(
    key: string,
    root: Element | Document,
    options: { record?: boolean } = {}
  ): Element | null {
    const locator = this.regions.get(key);
    if (!locator) return null;

    for (const candidate of locator.locators) {
      const match = tryLocator(candidate, root);
      if (match) {
        this.recordSuccess(key, options.record);
        return match;
      }
    }

    this.recordFailure(key, options.record);
    return null;
  }

  recordSuccess(key: string, record = true): void {
    if (!record) return;
    const locator = this.regions.get(key);
    if (!locator) return;

    locator.stats.hits += 1;
    locator.stats.reliability = reliability(locator.stats.hits, locator.stats.misses);
  }

  recordFailure(key: string, record = true): void {
    if (!record) return;
    const locator = this.regions.get(key);
    if (!locator) return;

    locator.stats.misses += 1;
    locator.stats.reliability = reliability(locator.stats.hits, locator.stats.misses);
  }
}

function reliability(hits: number, misses: number): number {
  const total = hits + misses;
  if (total === 0) return 0;
  return Math.round((hits / total) * 1000) / 1000;
}

function tryLocator(
  locator: { kind: 'css' | 'xpath' | 'text'; expression: string },
  root: Element | Document
): Element | null {
  if (locator.kind === 'css') {
    try {
      return root.querySelector(locator.expression);
    } catch {
      return null;
    }
  }

  if (locator.kind === 'text') {
    const signature = locator.expression.trim();
    if (!signature) return null;

    for (const element of Array.from(root.querySelectorAll('main *, body *'))) {
      const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text.startsWith(signature)) return element;
    }
  }

  return null;
}
