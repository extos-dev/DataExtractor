import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';
import { RegionCandidate } from '../../dom/regionTypes';

export class ArticleDetector extends BaseDetectorPlugin {
  readonly id = 'core.article';
  readonly kinds: PatternType[] = ['article'];
  readonly version = '2.0.0';

  applies(context: DetectionContext): boolean {
    return context.getRegion('article').length > 0;
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const regions = context.getRegion('article');
    const candidates: DetectionCandidate[] = [];

    for (const region of regions) {
      const evidence: Evidence[] = [];
      let score = region.score;

      evidence.push({
        signal: 'prose_region',
        weight: 0.4,
        value: region.score,
        explanation: 'Region contains multiple prose-like blocks.',
      });

      if (context.hasJsonLdType('Article')) {
        score += 0.22;
        evidence.push({
          signal: 'json_ld_article',
          weight: 0.22,
          value: 'Article',
          explanation: 'Page contains Article structured data.',
        });
      }

      if (context.hasJsonLdType('BlogPosting')) {
        score += 0.2;
        evidence.push({
          signal: 'json_ld_blog_posting',
          weight: 0.2,
          value: 'BlogPosting',
          explanation: 'Page contains BlogPosting structured data.',
        });
      }

      if (context.hasJsonLdType('NewsArticle')) {
        score += 0.22;
        evidence.push({
          signal: 'json_ld_news_article',
          weight: 0.22,
          value: 'NewsArticle',
          explanation: 'Page contains NewsArticle structured data.',
        });
      }

      if (this.hasSemanticArticle(context, region)) {
        score += 0.12;
        evidence.push({
          signal: 'semantic_article',
          weight: 0.12,
          value: true,
          explanation: 'Semantic article/main landmark supports this region.',
        });
      }

      if (this.hasDateOrAuthor(context, region)) {
        score += 0.08;
        evidence.push({
          signal: 'byline_or_date',
          weight: 0.08,
          value: true,
          explanation: 'Date, time, or author metadata found near region.',
        });
      }

      if (/\/(blog|news|article|post|insights)\/i/i.test(context.page.pathname)) {
        score += 0.06;
        evidence.push({
          signal: 'url_pattern',
          weight: 0.06,
          value: context.page.pathname,
          explanation: 'URL path resembles an article route.',
        });
      }

      if (region.linkDensity > 0.5) {
        score -= 0.18;
        evidence.push({
          signal: 'high_link_density',
          weight: -0.18,
          value: region.linkDensity,
          explanation: 'Region is too link-dense for article body content.',
        });
      }

      if (score < context.options.minConfidence) {
        continue;
      }

      candidates.push(
        this.candidate({
          context,
          detectorId: this.id,
          kind: 'article',
          region,
          element: region.element,
          score,
          evidence,
          metadata: {
            wordCount: region.wordCount,
            blockCount: region.metadata.blockCount,
          },
        })
      );
    }

    return this.rankAndLimit(candidates, context);
  }

  private hasSemanticArticle(
    context: DetectionContext,
    region: RegionCandidate
  ): boolean {
    const node = context.getNode(region.nodeId);

    if (!node) {
      return false;
    }

    let current: typeof node | undefined = node;

    for (let depth = 0; depth < 5 && current; depth++) {
      const tag = current.features.tag;
      const role = current.features.role;

      if (
        tag === 'article' ||
        role === 'article' ||
        tag === 'main' ||
        role === 'main'
      ) {
        return true;
      }

      current = current.parentId
        ? context.getNode(current.parentId)
        : undefined;
    }

    return false;
  }

  private hasDateOrAuthor(
    _context: DetectionContext,
    region: RegionCandidate
  ): boolean {
    const element = region.element;

    const date = element.querySelector(
      'time, [datetime], [itemprop=datePublished], [itemprop=dateModified]'
    );

    const author = element.querySelector(
      '[rel=author], [itemprop=author], .author, .byline, [data-author]'
    );

    return Boolean(date || author);
  }
}
