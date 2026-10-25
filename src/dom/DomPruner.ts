import { DEFAULT_PRUNER_OPTIONS, DomPrunerOptions } from './types';

const NOISE_SELECTORS = [
  '[aria-hidden="true"]',
  '[role="presentation"]',
  '[data-testid*="cookie" i]',
  '[class*="cookie-banner" i]',
  '[class*="cookie-consent" i]',
  '[class*="gdpr" i]',
  '[class*="consent" i]',
  '[id*="cookie-banner" i]',
  '[id*="cookie-consent" i]',
  '[class*="advertisement" i]',
  '[class*="advert" i]',
  '[class*="adsbygoogle" i]',
  '[class*="sponsor" i]',
  '[class*="newsletter-popup" i]',
  '[class*="modal-overlay" i]',
  '[class*="paywall" i]',
];

const SCRIPT_LIKE_TAGS = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE']);
const STYLE_LIKE_TAGS = new Set(['STYLE', 'LINK']);

export class DomPruner {
  private readonly options: Required<DomPrunerOptions>;

  constructor(options: DomPrunerOptions = {}) {
    this.options = { ...DEFAULT_PRUNER_OPTIONS, ...options };
  }

  prune(sourceRoot: ParentNode): {
    root: Element | DocumentFragment;
    stats: { prunedElements: number; hiddenElements: number };
  } {
    const root = this.cloneRoot(sourceRoot) as Element;
    const stats = { prunedElements: 0, hiddenElements: 0 };

    this.pruneNode(root as Element, stats, 0);

    if (this.options.removeCommonNoise) {
      this.removeMatching(root as Element, NOISE_SELECTORS, stats);
    }

    return { root: root as Element, stats };
  }

  private cloneRoot(sourceRoot: ParentNode): ParentNode {
    if (sourceRoot instanceof Document) {
      return sourceRoot.documentElement.cloneNode(true) as ParentNode;
    }
    if (sourceRoot instanceof DocumentFragment) {
      return sourceRoot.cloneNode(true) as ParentNode;
    }
    return (sourceRoot as Element).cloneNode(true) as ParentNode;
  }

  private pruneNode(
    node: Element,
    stats: { prunedElements: number; hiddenElements: number },
    depth: number
  ): void {
    if (depth > this.options.maxDepth) {
      node.remove();
      stats.prunedElements++;
      return;
    }

    if (this.shouldRemoveTag(node)) {
      node.remove();
      stats.prunedElements++;
      return;
    }

    if (this.options.removeHidden && this.isHidden(node)) {
      stats.hiddenElements++;
      node.setAttribute('data-tx-pruned', 'hidden');
    }

    if (this.options.removeIframes && this.matchesTag(node, ['IFRAME'])) {
      node.remove();
      stats.prunedElements++;
      return;
    }

    if (this.options.removeSvg && this.matchesTag(node, ['SVG'])) {
      node.remove();
      stats.prunedElements++;
      return;
    }

    if (this.options.preserveShadowDom) {
      this.preserveShadowRoots(node);
    }

    for (const child of Array.from(node.children)) {
      this.pruneNode(child, stats, depth + 1);
    }
  }

  private shouldRemoveTag(node: Element): boolean {
    const tag = node.tagName.toUpperCase();
    if (this.options.removeScripts && SCRIPT_LIKE_TAGS.has(tag)) {
      // JSON-LD blocks are data payloads, not executable noise; keep them so
      // extraction/classification can read structured metadata.
      if (tag === 'SCRIPT' && node.getAttribute('type') === 'application/ld+json') {
        return false;
      }
      return true;
    }
    if (this.options.removeStyles && STYLE_LIKE_TAGS.has(tag)) return true;
    if (this.options.removeNoScript && tag === 'NOSCRIPT') return true;
    if (this.options.removeTemplate && tag === 'TEMPLATE') return true;
    return false;
  }

  private isHidden(element: Element): boolean {
    if (element.hasAttribute('hidden')) return true;
    if (element.getAttribute('aria-hidden') === 'true') return true;
    const inlineStyle = element.getAttribute('style') ?? '';
    if (/display\s*:\s*none/i.test(inlineStyle)) return true;
    if (/visibility\s*:\s*hidden/i.test(inlineStyle)) return true;
    if (element instanceof HTMLElement) {
      if (element.hidden) return true;
      // Computed styles are only meaningful when the element is connected to
      // a document; pruned snapshots are detached clones, where a
      // getComputedStyle call would report everything as display:none.
      if (element.isConnected) {
        const computed = this.safeComputedStyle(element);
        if (computed) {
          if (computed.display === 'none') return true;
          if (computed.visibility === 'hidden') return true;
          if (Number(computed.opacity) === 0) return true;
        }
      }
    }
    return false;
  }

  private preserveShadowRoots(element: Element): void {
    const shadowRoot = (element as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (!shadowRoot) return;
    element.setAttribute('data-tx-has-shadow-root', 'true');
  }

  private removeMatching(
    root: Element,
    selectors: string[],
    stats: { prunedElements: number; hiddenElements: number }
  ): void {
    for (const selector of selectors) {
      let elements: Element[];
      try {
        elements = Array.from(root.querySelectorAll(selector));
      } catch {
        continue;
      }
      for (const element of elements) {
        element.remove();
        stats.prunedElements++;
      }
    }
  }

  private matchesTag(element: Element, tags: string[]): boolean {
    return tags.includes(element.tagName.toUpperCase());
  }

  private safeComputedStyle(element: HTMLElement): CSSStyleDeclaration | null {
    try {
      return window.getComputedStyle(element);
    } catch {
      return null;
    }
  }
}