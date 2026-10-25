import {
  DomFeatures,
  NormalizationResult,
  NormalizedDomNode,
} from './types';
import { DomPruner } from './DomPruner';
import { DomNormalizerOptions, DEFAULT_NORMALIZER_OPTIONS } from './types';

const NOISE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

export class DomNormalizer {
  private readonly pruner: DomPruner;
  private readonly options: Required<DomNormalizerOptions>;
  private nodeIdCounter = 0;
  private nodeById = new Map<string, NormalizedDomNode>();

  constructor(options: DomNormalizerOptions = {}) {
    this.options = { ...DEFAULT_NORMALIZER_OPTIONS, ...options };
    this.pruner = new DomPruner(this.options);
  }

  normalize(source: ParentNode): NormalizationResult {
    this.nodeIdCounter = 0;
    this.nodeById = new Map();

    const { root, stats } = this.pruner.prune(source);
    const rootElement = root as Element;

    const jsonLd = this.extractJsonLd(rootElement);
    const normalizedRoot = this.buildNode(rootElement, undefined, 0);

    return {
      root: normalizedRoot,
      nodeById: this.nodeById,
      jsonLd,
      stats: {
        totalElements: this.nodeById.size,
        prunedElements: stats.prunedElements,
        hiddenElements: stats.hiddenElements,
        jsonLdBlocks: jsonLd.length,
      },
    };
  }

  private buildNode(
    element: Element,
    parentId: string | undefined,
    depth: number
  ): NormalizedDomNode {
    const nodeId = this.createNodeId();
    const features = this.extractFeatures(element, depth);

    const node: NormalizedDomNode = { nodeId, parentId, element, features, children: [] };
    this.nodeById.set(nodeId, node);

    for (const child of Array.from(element.children)) {
      if (NOISE_TAGS.has(child.tagName.toUpperCase())) continue;
      node.children.push(this.buildNode(child, nodeId, depth + 1));
    }

    this.aggregateChildFeatures(node);
    return node;
  }

  private extractFeatures(element: Element, depth: number): DomFeatures {
    const text = this.cleanText(element.textContent ?? '').slice(0, this.options.textPreviewLength);
    const links = Array.from(element.querySelectorAll('a[href]'));
    const linkText = links.map((link) => link.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
    const textLength = text.length;
    const linkTextLength = linkText.length;
    const rect = this.options.includeGeometry && element instanceof HTMLElement ? this.safeRect(element) : undefined;

    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      classes: Array.from(element.classList),
      role: element.getAttribute('role') ?? undefined,
      text,
      textLength,
      wordCount: this.countWords(text),
      linkText,
      linkTextLength,
      linkCount: links.length,
      linkDensity: textLength > 0 ? Math.min(1, linkTextLength / textLength) : 0,
      imageCount: element.querySelectorAll('img, picture, [role=img]').length,
      inputCount: element.querySelectorAll('input, textarea, select').length,
      buttonCount: element.querySelectorAll('button, [role=button], [type=submit]').length,
      tableCount: element.querySelectorAll('table, [role=table], [role=grid]').length,
      listCount: element.querySelectorAll('ul, ol, dl, [role=list]').length,
      headingCount: element.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading]').length,
      paragraphCount: element.querySelectorAll('p').length,
      hasJsonLd: this.hasJsonLd(element),
      jsonLdTypes: this.extractLocalJsonLdTypes(element),
      depth,
      childElementCount: element.children.length,
      rect,
      visibility: this.getVisibility(element),
    };
  }

  private aggregateChildFeatures(node: NormalizedDomNode): void {
    let linkCount = 0, imageCount = 0, inputCount = 0, buttonCount = 0;
    let tableCount = 0, listCount = 0, headingCount = 0, paragraphCount = 0;

    for (const child of node.children) {
      linkCount += child.features.linkCount;
      imageCount += child.features.imageCount;
      inputCount += child.features.inputCount;
      buttonCount += child.features.buttonCount;
      tableCount += child.features.tableCount;
      listCount += child.features.listCount;
      headingCount += child.features.headingCount;
      paragraphCount += child.features.paragraphCount;
    }

    node.features.linkCount = Math.max(node.features.linkCount, linkCount);
    node.features.imageCount = Math.max(node.features.imageCount, imageCount);
    node.features.inputCount = Math.max(node.features.inputCount, inputCount);
    node.features.buttonCount = Math.max(node.features.buttonCount, buttonCount);
    node.features.tableCount = Math.max(node.features.tableCount, tableCount);
    node.features.listCount = Math.max(node.features.listCount, listCount);
    node.features.headingCount = Math.max(node.features.headingCount, headingCount);
    node.features.paragraphCount = Math.max(node.features.paragraphCount, paragraphCount);
  }

  private extractJsonLd(root: Element): unknown[] {
    const results: unknown[] = [];
    const scripts = Array.from(root.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent ?? '');
        if (Array.isArray(parsed)) results.push(...parsed);
        else results.push(parsed);
      } catch { /* ignore malformed JSON-LD */ }
    }
    return results;
  }

  private hasJsonLd(element: Element): boolean {
    return element.querySelector('script[type="application/ld+json"]') !== null;
  }

  private extractLocalJsonLdTypes(element: Element): string[] {
    const scripts = Array.from(element.querySelectorAll('script[type="application/ld+json"]'));
    const types: string[] = [];
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent ?? '');
        this.collectJsonLdTypes(parsed, types);
      } catch { /* ignore */ }
    }
    return Array.from(new Set(types));
  }

  private collectJsonLdTypes(value: unknown, output: string[]): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) this.collectJsonLdTypes(item, output);
      return;
    }
    const record = value as Record<string, unknown>;
    const type = record['@type'];
    if (typeof type === 'string') output.push(type);
    else if (Array.isArray(type)) for (const item of type) if (typeof item === 'string') output.push(item);
    for (const child of Object.values(record)) this.collectJsonLdTypes(child, output);
  }

  private getVisibility(element: Element): DomFeatures['visibility'] {
    if (element.hasAttribute('data-tx-pruned')) return 'hidden';
    if (element instanceof HTMLElement) {
      // See DomPruner: computed styles only make sense for connected elements.
      if (element.isConnected) {
        const computed = this.safeComputedStyle(element);
        if (computed?.display === 'none') return 'hidden';
        if (computed?.visibility === 'hidden') return 'hidden';
      }
    }
    return 'visible';
  }

  private safeRect(element: HTMLElement) {
    try {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    } catch { return undefined; }
  }

  private safeComputedStyle(element: HTMLElement) {
    try { return window.getComputedStyle(element); } catch { return null; }
  }

  private createNodeId(): string {
    return `n${++this.nodeIdCounter}`;
  }

  private countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  private cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
}