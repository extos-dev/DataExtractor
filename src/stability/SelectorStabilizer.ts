import { ResolvedLocator } from './types';

interface StabilizerOptions {
  /** Prefer data-* attributes if present. */
  preferDataAttributes?: boolean;
  /** Max path depth used by css-path / structural strategies. */
  maxDepth?: number;
}

const DEFAULTS: Required<StabilizerOptions> = {
  preferDataAttributes: true,
  maxDepth: 6,
};

/**
 * Produces an ordered list of relocation locators for a detected element,
 * from most stable (stable data attributes) to last-resort (full path).
 */
export class SelectorStabilizer {
  private readonly options: Required<StabilizerOptions>;

  constructor(options: StabilizerOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  stabilize(element: Element): ResolvedLocator[] {
    const signatures = this.buildSignatures(element);
    const locators: ResolvedLocator[] = [];

    const dataAttr = this.dataAttributeLocator(element);
    if (dataAttr) locators.push(dataAttr);

    const aria = this.ariaLocator(element);
    if (aria) locators.push(aria);

    const semantic = this.semanticLocator(element);
    if (semantic) locators.push(semantic);

    locators.push(this.structuralLocator(element, signatures));
    locators.push(this.textSignatureLocator(element, signatures));
    locators.push(this.cssPathLocator(element));

    return locators.filter(Boolean);
  }

  private buildSignatures(element: Element): string[] {
    const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const prefix = text.slice(0, 120);
    const signatures: string[] = [];

    if (prefix) signatures.push(prefix);

    const heading = element.querySelector('h1, h2, h3');
    const headingText = heading?.textContent?.replace(/\s+/g, ' ').trim();
    if (headingText && headingText !== prefix) {
      signatures.push(headingText);
    }

    return signatures;
  }

  private dataAttributeLocator(element: Element): ResolvedLocator | null {
    const stable = ['data-testid', 'data-test', 'data-test-id', 'id'].find(
      (attr) => element.hasAttribute(attr)
    );

    if (!stable) return null;

    const value = element.getAttribute(stable)!;
    const selector =
      stable === 'id' ? `#${cssEscape(value)}` : `[${stable}="${value}"]`;

    return {
      strategy: stable === 'id' ? 'data-attribute' : 'semantic',
      kind: 'css',
      expression: selector,
      score: stable === 'id' ? 0.95 : 0.9,
      signatures: [],
    };
  }

  private ariaLocator(element: Element): ResolvedLocator | null {
    const role = element.getAttribute('role');
    if (!role) return null;

    const label = element.getAttribute('aria-label');

    return {
      strategy: 'aria',
      kind: 'css',
      expression: label
        ? `[role="${role}"][aria-label="${label}"]`
        : `[role="${role}"]`,
      score: label ? 0.85 : 0.6,
      signatures: [],
    };
  }

  private semanticLocator(element: Element): ResolvedLocator | null {
    const tag = element.tagName.toLowerCase();

    if (['main', 'article', 'header', 'footer', 'nav', 'table', 'form'].includes(tag)) {
      return {
        strategy: 'semantic',
        kind: 'css',
        expression: tag,
        score: 0.7,
        signatures: [],
      };
    }

    const classHit = (element.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean)[0];

    if (classHit && !classHit.includes(':')) {
      return {
        strategy: 'semantic',
        kind: 'css',
        expression: `${tag}.${cssEscape(classHit)}`,
        score: 0.65,
        signatures: [],
      };
    }

    return null;
  }

  private structuralLocator(
    element: Element,
    signatures: string[]
  ): ResolvedLocator {
    return {
      strategy: 'structural',
      kind: 'css',
      expression: this.structuralPath(element),
      score: 0.45,
      signatures,
    };
  }

  private structuralPath(element: Element): string {
    const parts: string[] = [];
    let current: Element | null = element;

    for (let depth = 0; depth < this.options.maxDepth && current; depth++) {
      const selector = current.tagName.toLowerCase();
      const nth = indexOfElementAmong(current);
      parts.unshift(nth > 1 ? `${selector}:nth-of-type(${nth})` : selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  private textSignatureLocator(
    _element: Element,
    signatures: string[]
  ): ResolvedLocator {
    return {
      strategy: 'text-signature',
      kind: 'text',
      expression: signatures[0] ?? '',
      score: signatures.length > 0 ? 0.55 : 0.1,
      signatures,
    };
  }

  private cssPathLocator(element: Element): ResolvedLocator {
    return {
      strategy: 'css-path',
      kind: 'css',
      expression: this.structuralPath(element),
      score: 0.3,
      signatures: [],
    };
  }
}

function indexOfElementAmong(element: Element): number {
  const parent = element.parentElement;
  if (!parent) return 1;

  const tag = element.tagName.toLowerCase();
  const sameTag = Array.from(parent.children).filter(
    (child) => child.tagName.toLowerCase() === tag
  );

  const index = sameTag.indexOf(element);
  return index + 1;
}

function cssEscape(value: string): string {
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}
