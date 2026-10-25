import { ListData } from './types';

/** A card-grid item should contain a title-ish element and/or a link. */
function isItemLike(item: Element): boolean {
  return item.querySelector('a, h1, h2, h3, h4, img, button') !== null;
}

export class ListExtractor {
  extract(context: {
    element: Element;
    document?: Document;
    jsonLd: unknown[];
    hasJsonLdType: (type: string) => boolean;
  }): { data: ListData } | null {
    const element = context.element;

    const semantic = this.fromSemanticList(element);
    if (semantic) return { data: semantic };

    const cards = this.fromCardGrid(element);
    if (cards) return { data: cards };

    return null;
  }

  private fromSemanticList(element: Element): ListData | null {
    let list: Element | null = null;

    if (element.tagName.toLowerCase() === 'ul' || element.tagName.toLowerCase() === 'ol') {
      list = element;
    } else {
      list = element.querySelector('ul, ol');
    }

    if (!list) return null;

    const items = Array.from(list.children)
      .filter((li) => li.tagName.toLowerCase() === 'li' || isItemLike(li))
      .map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((text) => text.length > 0);

    if (items.length < 2) return null;

    const images = Array.from(list.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') ?? img.getAttribute('data-src') ?? '')
      .filter((src) => src.length > 0 && !src.startsWith('data:'));

    return {
      ordered: list.tagName.toLowerCase() === 'ol',
      items,
      itemImages: images,
    };
  }

  private fromCardGrid(element: Element): ListData | null {
    const grid =
      element.classList.contains('grid') ||
      element.querySelector('[class*="grid" i], [class*="list" i]');

    if (!grid) return null;

    const gridElement = grid instanceof Element ? grid : element;
    const items = Array.from(gridElement.children).filter(isItemLike);

    if (items.length < 2) return null;

    return {
      ordered: false,
      items: items.map(
        (item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      ),
      itemImages: Array.from(gridElement.querySelectorAll('img'))
        .map((img) => img.getAttribute('src') ?? '')
        .filter(Boolean),
    };
  }
}
