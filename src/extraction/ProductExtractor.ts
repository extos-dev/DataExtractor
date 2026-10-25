import { ProductData } from './types';
import { resolveJsonLdNodes } from './jsonLd';

/** Collect image URLs, preferring elements that look like lead imagery. */
export function collectImages(element: Element, limit = 5): string[] {
  const images: string[] = [];

  const seed = element.querySelectorAll(
    'img, [class*="image" i img], [class*="photo" i] img, [itemprop=image]'
  );

  for (const img of Array.from(seed)) {
    const src =
      img.getAttribute('src') ??
      img.getAttribute('data-src') ??
      img.getAttribute('data-lazy-src');
    if (!src || src.startsWith('data:')) continue;
    if (!images.includes(src)) images.push(src);
    if (images.length >= limit) break;
  }

  return images;
}

function ratingNumber(value: unknown): number | undefined {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : undefined;
}

export class ProductExtractor {
  extract(context: {
    element: Element;
    document?: Document;
    jsonLd: unknown[];
    hasJsonLdType: (type: string) => boolean;
  }): { data: ProductData } | null {
    const structured: Partial<ProductData> = {};

    resolveJsonLdNodes(context.jsonLd, ['product'], (node) => {
      if (typeof node.name === 'string') structured.title ||= node.name;
      if (typeof node.description === 'string') structured.description ||= node.description;
      if (typeof node.sku === 'string') structured.sku ||= node.sku;

      const brand = node.brand;
      if (typeof brand === 'string') structured.brand ||= brand;
      if (brand && typeof brand === 'object') {
        const name = (brand as Record<string, unknown>).name;
        if (typeof name === 'string') structured.brand ||= name;
      }

      if (node.image) {
        const image = Array.isArray(node.image) ? node.image[0] : node.image;
        if (typeof image === 'string' && !structured.images) {
          structured.images = [image];
        }
      }

      const rating = node.aggregateRating as Record<string, unknown> | undefined;
      if (rating && typeof rating === 'object') {
        structured.rating ||= ratingNumber(rating.ratingValue);
        structured.reviewCount ||= ratingNumber(rating.reviewCount);
      }

      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      if (offers && typeof offers === 'object') {
        const offer = offers as Record<string, unknown>;
        if (offer.price !== undefined) {
          structured.price ||= String(offer.price);
        }
        if (typeof offer.priceCurrency === 'string') {
          structured.currency ||= offer.priceCurrency;
        }
        if (typeof offer.availability === 'string') {
          structured.availability ||= offer.availability.split('/').pop();
        }
      }
    });

    const element = context.element;
    const dom: Partial<ProductData> = {};

    const titleEl = element.querySelector('h1, [itemprop=name], .product-title');
    if (titleEl) {
      dom.title ||= titleEl.textContent?.replace(/\s+/g, ' ').trim() || undefined;
    }

    if (!structured.price) {
      const priceEl = element.querySelector('[itemprop=price], .price, .product-price');
      const priceText = priceEl?.textContent?.replace(/\s+/g, ' ').trim();
      if (priceText) dom.price ||= priceText;
    }

    if (!structured.availability) {
      const availabilityEl = element.querySelector('.availability, [itemprop=availability]');
      const text = availabilityEl?.textContent?.replace(/\s+/g, '').trim();
      if (text) {
        dom.availability ||= text.includes('InStock') || /in stock/i.test(text)
          ? 'InStock'
          : text;
      }
    }

    if (!structured.description) {
      const descEl = element.querySelector('[class*="description" i]');
      const text = descEl?.textContent?.replace(/\s+/g, ' ').trim();
      if (text) dom.description ||= text;
    }

    if (!structured.images || structured.images.length === 0) {
      structured.images = collectImages(element);
    }

    const data: ProductData = {
      title: structured.title ?? dom.title,
      price: structured.price ?? dom.price,
      currency: structured.currency,
      availability: structured.availability ?? dom.availability,
      sku: structured.sku,
      brand: structured.brand,
      description: structured.description ?? dom.description,
      images: structured.images,
      rating: structured.rating,
      reviewCount: structured.reviewCount,
    };

    if (!data.title && !data.price) return null;

    return { data };
  }
}
