import { ArticleData } from './types';
import { resolveJsonLdNodes } from './jsonLd';

export interface ArticleJsonLd {
  title?: string;
  author?: string;
  date?: string;
  description?: string;
}

type TypeNames = string[];

export class ArticleExtractor {
  extract(context: {
    element: Element;
    document?: Document;
    jsonLd: unknown[];
    hasJsonLdType: (type: string) => boolean;
  }): { data: ArticleData } | null {
    const structured = this.fromJsonLd(context.jsonLd);
    const dom = this.fromDom(context.element, context.document);

    const data: ArticleData = {
      title: structured.title ?? dom.title,
      author: structured.author ?? dom.author,
      date: structured.date ?? dom.date,
      description: structured.description ?? dom.description,
      paragraphs: dom.paragraphs,
      headings: dom.headings,
      images: dom.images,
    };

    const hasMinimum =
      Boolean(data.title) ||
      dom.paragraphs.length > 0 ||
      structured.title !== undefined;

    if (!hasMinimum) return null;
    return { data };
  }

  private fromJsonLd(jsonLd: unknown[]): ArticleJsonLd {
    const out: ArticleJsonLd = {};

    const articleTypes: TypeNames = [
      'article',
      'blogposting',
      'newsarticle',
      'techarticle',
    ];

    resolveJsonLdNodes(jsonLd, articleTypes, (node) => {
      if (typeof node.name === 'string') out.title ||= node.name;
      if (typeof node.headline === 'string') out.title ||= node.headline;
      if (typeof node.description === 'string') out.description ||= node.description;
      if (typeof node.datePublished === 'string') out.date ||= node.datePublished;

      const author = node.author;
      if (typeof author === 'string') {
        out.author ||= author;
      } else if (author && typeof author === 'object') {
        const name = (author as Record<string, unknown>).name;
        if (typeof name === 'string') out.author ||= name;
      }
    });

    return out;
  }

  private fromDom(
    element: Element,
    document?: Document
  ): Omit<ArticleData, 'title' | 'author' | 'date' | 'description'> & {
    title?: string;
    author?: string;
    date?: string;
    description?: string;
  } {
    const paragraphs: string[] = [];

    for (const p of element.querySelectorAll(':scope p, :scope > * > p')) {
      const text = p.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text.length > 0) paragraphs.push(text);
    }

    const headings: { level: number; text: string }[] = [];
    for (const h of element.querySelectorAll(':scope h1, :scope h2, :scope h3, :scope h4, :scope h5, :scope h6')) {
      const text = h.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const level = Number(h.tagName.slice(1));
      if (text && !Number.isNaN(level)) headings.push({ level, text });
    }

    const images: string[] = [];
    for (const img of element.querySelectorAll(':scope img, :scope > * > img')) {
      const src = img.getAttribute('src') ?? img.getAttribute('data-src');
      if (src && !images.includes(src)) images.push(src);
    }

    const meta = (name: string): string | undefined => {
      if (!document) return undefined;
      return document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ?? undefined;
    };

    return {
      title:
        element.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? undefined,
      author:
        element
          .querySelector('.byline, .author, [itemprop=author], [rel=author]')
          ?.textContent?.replace(/\s+/g, ' ')
          .replace(/^By\s+/i, '')
          .trim() ?? undefined,
      date: element.querySelector('time[datetime]')?.getAttribute('datetime') ?? undefined,
      description: meta('og:description') ?? meta('description') ?? undefined,
      paragraphs,
      headings,
      images,
    };
  }
}
