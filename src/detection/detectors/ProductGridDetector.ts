import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';

const CARD_SELECTORS = [
  '[class*="product-card" i]',
  '[class*="product-item" i]',
  '[class*="productCard" i]',
  'li[class*="product" i]',
  'article[class*="product" i]',
];

function pricePattern(text: string): boolean {
  return /(?:[$€£¥]|USD|EUR|GBP)\s*\d+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?\s*(?:USD|EUR|GBP)\b/i.test(
    text
  );
}

export class ProductGridDetector extends BaseDetectorPlugin {
  readonly id = 'core.product_grid';
  readonly kinds: PatternType[] = ['product_listing'];
  readonly version = '2.0.0';

  applies(context: DetectionContext): boolean {
    return (
      context.getRegion('product_listing').length > 0 ||
      context.getBlocks('card_grid').length > 0
    );
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    for (const region of context.getRegion('product_listing')) {
      const candidate = this.buildCandidate(context, region.element);
      if (candidate) {
        candidate.regionId = region.regionId;
        candidate.metadata = { ...region.metadata, ...candidate.metadata };
        candidates.push(candidate);
      }
    }

    for (const block of context.getBlocks('card_grid')) {
      const alreadyCovered = candidates.some(
        (candidate) =>
          candidate.element.contains(block.element) ||
          block.element.contains(candidate.element)
      );

      if (alreadyCovered) continue;

      const candidate = this.buildCandidate(context, block.element);
      if (candidate) candidates.push(candidate);
    }

    return this.rankAndLimit(candidates, context);
  }

  private buildCandidate(
    context: DetectionContext,
    element: Element
  ): DetectionCandidate | null {
    const cards = this.findCards(element);
    if (cards < 2) return null;

    const evidence: Evidence[] = [
      {
        signal: 'product_card_cluster',
        weight: cards,
        value: cards,
        explanation: `${cards} similar product-like cards were found.`,
      },
    ];

    let score = 0.4 + Math.min(0.2, cards * 0.02);

    const features = this.sampleCardFeatures(element);
    const featureRatio = features.filter(Boolean).length / features.length;

    if (featureRatio >= 0.5) {
      score += 0.2;
      evidence.push({
        signal: 'card_commerce_features',
        weight: 0.2,
        value: featureRatio,
        explanation:
          'Sampled cards contain titles and prices or commerce actions.',
      });
    }

    if (context.hasJsonLdType('itemlist')) {
      score += 0.15;
      evidence.push({
        signal: 'jsonld_itemlist',
        weight: 0.15,
        value: true,
        explanation: 'JSON-LD ItemList markup supports a listing page.',
      });
    }

    if (element.querySelector('nav[class*="pagination" i], a[href*="page="]')) {
      score += 0.08;
      evidence.push({
        signal: 'pagination',
        weight: 0.08,
        value: true,
        explanation: 'Pagination controls indicate a listing page.',
      });
    }

    if (score < context.options.minConfidence) {
      return null;
    }

    return this.candidate({
      context,
      detectorId: this.id,
      kind: 'product_listing',
      element,
      score,
      evidence,
      metadata: { cardCount: cards },
    });
  }

  private findCards(element: Element): number {
    let found = 0;

    for (const selector of CARD_SELECTORS) {
      const matches = element.querySelectorAll(selector).length;
      if (matches > found) found = matches;
    }

    if (found >= 2) return found;

    // Fallback: repeated structurally similar siblings.
    const grid = element.querySelector(
      [':root > * > * > *', ':root > * > *', ':root > *'].join(', ')
    );
    if (!grid) return found;

    const siblings = Array.from(grid.parentElement?.children ?? []);
    if (siblings.length >= 3) {
      const tags = new Set(siblings.map((sibling) => sibling.tagName.toLowerCase()));
      if (tags.size <= 2) return siblings.length;
    }

    return found;
  }

  private sampleCardFeatures(element: Element): boolean[] {
    const cards = Array.from(
      element.querySelectorAll(CARD_SELECTORS.join(', '))
    ).slice(0, 5);

    const sample = cards.length > 0 ? cards : Array.from(element.children).slice(0, 5);

    return sample.map((card) => {
      const text = card.textContent ?? '';
      const hasTitle = card.querySelector('h1,h2,h3,h4,a') !== null;
      const hasPrice = pricePattern(text);
      return hasTitle && hasPrice;
    });
  }
}
