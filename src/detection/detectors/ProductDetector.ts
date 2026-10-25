import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  FieldCandidate,
  PatternType,
} from '../types';
import { RegionCandidate } from '../../dom/regionTypes';

function walkJsonLd(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walkJsonLd(item, visit);
    return;
  }
  const record = value as Record<string, unknown>;
  visit(record);
  for (const item of Object.values(record)) walkJsonLd(item, visit);
}

export interface ResolvedProductFields {
  title?: string;
  price?: string;
  availability?: string;
  currency?: string;
  sku?: string;
  brand?: string;
}

export function resolveProductJsonLd(
  context: DetectionContext
): { fields: ResolvedProductFields; found: boolean } {
  const fields: ResolvedProductFields = {};
  let found = false;

  for (const item of context.normalized.jsonLd) {
    walkJsonLd(item, (node) => {
      const type = node['@type'];
      const types = Array.isArray(type) ? type.map(String) : [String(type ?? '')];
      if (!types.some((t) => t.toLowerCase() === 'product')) return;

      found = true;
      if (typeof node.name === 'string') fields.title ||= node.name;
      if (typeof node.sku === 'string') fields.sku ||= node.sku;

      const brand = node.brand;
      if (typeof brand === 'string') fields.brand ||= brand;
      if (brand && typeof brand === 'object' && typeof (brand as Record<string, unknown>).name === 'string') {
        fields.brand ||= (brand as Record<string, unknown>).name as string;
      }

      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      if (offers && typeof offers === 'object') {
        const offer = offers as Record<string, unknown>;
        if (typeof offer.price === 'string' || typeof offer.price === 'number') {
          fields.price ||= String(offer.price);
        }
        if (typeof offer.priceCurrency === 'string') fields.currency ||= offer.priceCurrency;
        if (typeof offer.availability === 'string') {
          fields.availability ||= offer.availability.split('/').pop() ?? offer.availability;
        }
      }
    });
  }

  return { fields, found };
}

export function collectProductDomFields(element: Element): ResolvedProductFields {
  const domText = (selector: string): string | undefined => {
    const match = element.querySelector(selector);
    if (!match) return undefined;
    const text = match.textContent?.replace(/\s+/g, ' ').trim();
    return text && text.length > 0 ? text : undefined;
  };

  const fields: ResolvedProductFields = {};

  fields.title ||=
    domText('h1') ??
    domText('[itemprop=name]') ??
    domText('.product-title') ??
    domText('.product__title');

  const priceText =
    domText('[itemprop=price]') ??
    domText('.price') ??
    domText('.product-price') ??
    domText('.product__price');

  if (priceText) fields.price ||= priceText;

  const availabilityText =
    domText('[itemprop=availability]') ??
    domText('.availability') ??
    domText('.product-availability');

  if (availabilityText) {
    fields.availability ||= availabilityText.includes('In Stock')
      ? 'InStock'
      : availabilityText;
  }

  return fields;
}

export class ProductDetector extends BaseDetectorPlugin {
  readonly id = 'core.product';
  readonly kinds: PatternType[] = ['product'];
  readonly version = '2.0.0';

  applies(context: DetectionContext): boolean {
    return (
      context.getRegion('product').length > 0 ||
      context.hasJsonLdType('product')
    );
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    for (const region of context.getRegion('product')) {
      const candidate = this.buildCandidate(context, region);
      if (candidate) candidates.push(candidate);
    }

    // JSON-LD products without a matched region: anchor on the most
    // central h1/+container so a typed extraction is still possible.
    if (candidates.length === 0 && context.hasJsonLdType('product')) {
      const { fields } = resolveProductJsonLd(context);
      const title = fields.title;
      const anchor = title
        ? context.normalized.root.element.querySelector('main article, main, body')
        : undefined;

      if (anchor) {
        const evidence: Evidence[] = [
          {
            signal: 'jsonld_product',
            weight: 0.4,
            value: true,
            explanation: 'JSON-LD Product markup was found on the page.',
          },
        ];
        candidates.push(
          this.candidate({
            context,
            detectorId: this.id,
            kind: 'product',
            element: anchor,
            score: 0.6,
            evidence,
            fields: this.toFieldCandidates(fields, 'json-ld'),
            metadata: { anchoredFrom: 'jsonld' },
          })
        );
      }
    }

    return this.rankAndLimit(candidates, context);
  }

  private buildCandidate(
    context: DetectionContext,
    region: RegionCandidate
  ): DetectionCandidate | null {
    const evidence: Evidence[] = [];
    let score = region.score;

    evidence.push({
      signal: 'region_score',
      weight: region.score,
      value: region.score,
      explanation: 'RegionGrouper scored this region as a product.',
    });

    const jsonLd = resolveProductJsonLd(context);
    if (jsonLd.found) {
      score += 0.25;
      evidence.push({
        signal: 'jsonld_product',
        weight: 0.25,
        value: true,
        explanation: 'JSON-LD Product markup confirms the region.',
      });
    }

    const domFields = collectProductDomFields(region.element);
    const hasPrice = Boolean(jsonLd.fields.price ?? domFields.price);
    const hasAddToCart =
      region.element.querySelector(
        'button, a, [class*="cart" i], [class*="checkout" i]'
      ) !== null;

    if (hasPrice) {
      score += 0.12;
      evidence.push({
        signal: 'price_present',
        weight: 0.12,
        value: jsonLd.fields.price ?? domFields.price,
        explanation: 'A price value was found.',
      });
    }

    if (hasAddToCart) {
      score += 0.08;
      evidence.push({
        signal: 'commerce_actions',
        weight: 0.08,
        value: true,
        explanation: 'Add-to-cart / checkout affordance found.',
      });
    }

    if (score < context.options.minConfidence) {
      return null;
    }

    const jsonldTyped = this.toFieldCandidates(jsonLd.fields, 'json-ld');
    const domTyped = this.toFieldCandidates(domFields, 'semantic-html');

    const fields: Record<string, FieldCandidate> = { ...domTyped };
    for (const [key, value] of Object.entries(jsonldTyped)) {
      // Structured data outranks heuristic DOM guesses.
      fields[key] = value;
    }

    return this.candidate({
      context,
      detectorId: this.id,
      kind: 'product',
      region,
      element: region.element,
      score,
      evidence,
      fields,
      metadata: { ...region.metadata },
    });
  }

  private toFieldCandidates(
    fields: ResolvedProductFields,
    source: FieldCandidate['source']
  ): Record<string, FieldCandidate> {
    const output: Record<string, FieldCandidate> = {};

    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      output[`product.${snake(key)}`] = {
        value,
        confidence: source === 'json-ld' ? 0.95 : 0.7,
        source,
      };
    }

    return output;
  }
}

function snake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
