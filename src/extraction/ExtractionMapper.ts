import { DetectionCandidate, DetectionContext } from '../detection/types';
import {
  ExtractionMappingContext,
  ExtractionData,
  ExtractionResultItem,
} from './types';
import { ArticleExtractor } from './ArticleExtractor';
import { ProductExtractor } from './ProductExtractor';
import { AiChatExtractor } from './AiChatExtractor';
import { TableExtractor } from './TableExtractor';
import { ListExtractor } from './ListExtractor';
import { MarkdownFormatter } from './MarkdownFormatter';
import { LlmContextFormatter } from './LlmContextFormatter';

const PRODUCT_KINDS = new Set(['product', 'product_listing']);

/**
 * Maps each arbitrated detection candidate to a typed extraction, then
 * renders it as markdown + an LLM context record.
 */
export class ExtractionMapper {
  private readonly article = new ArticleExtractor();
  private readonly product = new ProductExtractor();
  private readonly chat = new AiChatExtractor();
  private readonly table = new TableExtractor();
  private readonly list = new ListExtractor();
  private readonly markdown = new MarkdownFormatter();
  private readonly llmContext = new LlmContextFormatter();

  map(
    candidate: DetectionCandidate,
    context: DetectionContext
  ): ExtractionResultItem | null {
    const mappingContext = this.buildMappingContext(candidate, context);

    const extracted = this.extractFor(candidate.kind, mappingContext);
    if (!extracted) return null;

    const title = this.deriveTitle(extracted.data, candidate, context);

    const item: ExtractionResultItem = {
      kind: candidate.kind,
      detectorId: candidate.detectorId,
      nodeId: candidate.nodeId,
      confidence: candidate.confidence,
      element: candidate.element,
      data: extracted.data,
      markdown: this.markdown.format(candidate.kind, extracted.data, title),
      llmContext: this.llmContext.format(
        candidate.kind,
        candidate.confidence,
        title,
        extracted.data
      ),
    };

    return item;
  }

  private extractFor(
    kind: DetectionCandidate['kind'],
    mappingContext: ExtractionMappingContext
  ) {
    switch (kind) {
      case 'article':
      case 'blog_index':
        return this.article.extract(mappingContext);
      case 'product':
      case 'product_listing':
        return PRODUCT_KINDS.has(kind)
          ? kind === 'product'
            ? this.product.extract(mappingContext)
            : this.list.extract(mappingContext)
          : null;
      case 'ai_chat':
        return this.chat.extract(mappingContext);
      case 'table':
        return this.table.extract(mappingContext);
      case 'list':
        return this.list.extract(mappingContext);
      default:
        return null;
    }
  }

  private buildMappingContext(
    candidate: DetectionCandidate,
    context: DetectionContext
  ): ExtractionMappingContext {
    const doc =
      candidate.element.ownerDocument ??
      (context.sourceRoot instanceof Document ? context.sourceRoot : undefined);

    return {
      element: candidate.element,
      document: doc ?? undefined,
      jsonLd: context.normalized.jsonLd,
      hasJsonLdType: (type: string) => context.hasJsonLdType(type),
    };
  }

  private deriveTitle(
    data: ExtractionData,
    candidate: DetectionCandidate,
    context: DetectionContext
  ): string {
    const record = data as unknown as Record<string, unknown>;
    const fallbacks = [
      record.title,
      record.name,
      record.caption,
      candidate.element
        .querySelector('h1, h2, [class*="title" i]')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
      context.page.title,
      candidate.kind.replace(/_/g, ' '),
    ];

    for (const fallback of fallbacks) {
      if (typeof fallback === 'string' && fallback.trim().length > 0) {
        return fallback.trim();
      }
    }

    return candidate.kind;
  }
}
