import { DetectionCandidate, DetectionContext, PatternType } from '../detection/types';
import { PageClassification, PageEvidence, PageType } from './types';

export interface PageClassifierOptions {
  minConfidence?: number;
}

export const DEFAULT_PAGE_CLASSIFIER_OPTIONS: Required<PageClassifierOptions> = {
  minConfidence: 0.35,
};

const DETECTION_TO_PAGE: Partial<Record<PatternType, PageType>> = {
  article: 'article',
  product: 'product_detail',
  product_listing: 'product_listing',
  ai_chat: 'ai_chat',
  table: 'dashboard',
  form: 'landing_page',
};

const STRONG_JSONLD_TYPES: Record<string, PageType> = {
  article: 'article',
  blogposting: 'article',
  newsarticle: 'news_article',
  product: 'product_detail',
  itemlist: 'product_listing',
  searchresultspage: 'search_results',
  faqpage: 'landing_page',
  webpage: 'unknown',
};

export class PageClassifier {
  private readonly options: Required<PageClassifierOptions>;

  constructor(options: PageClassifierOptions = {}) {
    this.options = { ...DEFAULT_PAGE_CLASSIFIER_OPTIONS, ...options };
  }

  classify(
    context: DetectionContext,
    candidates: DetectionCandidate[]
  ): PageClassification {
    const scores = this.createEmptyScores();
    const evidence: PageEvidence[] = [];

    this.scoreFromDetections(candidates, scores, evidence);
    this.scoreFromJsonLd(context, scores, evidence);
    this.scoreFromUrl(context, scores, evidence);
    this.scoreFromPageStructure(context, scores, evidence);

    const ranked = this.rank(scores);

    const pageType = ranked[0]?.pageType ?? 'unknown';
    const confidence = ranked[0]?.score ?? 0;

    return {
      pageType:
        confidence >= this.options.minConfidence ? pageType : 'unknown',
      confidence: clamp(confidence),
      scores,
      evidence,
      primaryDetection: this.getPrimaryDetection(candidates),
    };
  }

  private scoreFromDetections(
    candidates: DetectionCandidate[],
    scores: Record<PageType, number>,
    evidence: PageEvidence[]
  ): void {
    for (const candidate of candidates) {
      const pageType = DETECTION_TO_PAGE[candidate.kind];
      if (!pageType) {
        continue;
      }

      const weight = candidate.score * 0.55;
      scores[pageType] += weight;

      evidence.push({
        signal: 'detection_candidate',
        weight,
        value: {
          detector: candidate.detectorId,
          kind: candidate.kind,
          score: candidate.score,
        },
        explanation: `A ${candidate.kind} detection supports a ${pageType} page.`,
      });
    }
  }

  private scoreFromJsonLd(
    context: DetectionContext,
    scores: Record<PageType, number>,
    evidence: PageEvidence[]
  ): void {
    for (const type of context.page.jsonLdTypes) {
      const normalized = type.toLowerCase();
      const pageType = STRONG_JSONLD_TYPES[normalized];

      if (!pageType || pageType === 'unknown') {
        continue;
      }

      const weight = 0.3;
      scores[pageType] += weight;

      evidence.push({
        signal: 'json_ld_type',
        weight,
        value: type,
        explanation: `JSON-LD type ${type} supports a ${pageType} page.`,
      });
    }
  }

  private scoreFromUrl(
    context: DetectionContext,
    scores: Record<PageType, number>,
    evidence: PageEvidence[]
  ): void {
    const path = context.page.pathname.toLowerCase();

    const rules: Array<{
      pattern: RegExp;
      pageType: PageType;
      weight: number;
    }> = [
      { pattern: /\/(blog|news|article|posts|insights)\//, pageType: 'article', weight: 0.12 },
      { pattern: /\/(product|p|item|shop)\//, pageType: 'product_detail', weight: 0.14 },
      { pattern: /\/(collection|category|products|shop|search)/, pageType: 'product_listing', weight: 0.1 },
      { pattern: /\/(chat|conversation|assistant|copilot)/, pageType: 'ai_chat', weight: 0.15 },
      { pattern: /\/(docs|documentation|guide|reference)/, pageType: 'documentation', weight: 0.12 },
      { pattern: /\/(login|signin|sign-in|auth)/, pageType: 'login', weight: 0.2 },
      { pattern: /\/(forum|thread|topic|discussion)/, pageType: 'forum_thread', weight: 0.14 },
    ];

    for (const rule of rules) {
      if (rule.pattern.test(path)) {
        scores[rule.pageType] += rule.weight;

        evidence.push({
          signal: 'url_pattern',
          weight: rule.weight,
          value: path,
          explanation: `URL path matches a ${rule.pageType} pattern.`,
        });
      }
    }
  }

  private scoreFromPageStructure(
    context: DetectionContext,
    scores: Record<PageType, number>,
    evidence: PageEvidence[]
  ): void {
    const articleRegions = context.getRegion('article');
    const chatRegions = context.getRegion('ai_chat');
    const listingRegions = context.getRegion('product_listing');
    const tableRegions = context.getRegion('data_table');
    const navigationRegions = context.getRegion('navigation');

    if (articleRegions.length > 0) {
      const wordCount = articleRegions.reduce(
        (total, region) => total + region.wordCount,
        0
      );

      if (wordCount > 300) {
        const weight = 0.12;
        scores.article += weight;

        evidence.push({
          signal: 'long_prose_region',
          weight,
          value: wordCount,
          explanation: 'Page contains a substantial article-like prose region.',
        });
      }
    }

    if (chatRegions.length > 0) {
      const weight = 0.15;
      scores.ai_chat += weight;

      evidence.push({
        signal: 'chat_region',
        weight,
        value: chatRegions.length,
        explanation: 'Page contains a chat-conversation region.',
      });
    }

    if (listingRegions.length > 0) {
      const weight = 0.15;
      scores.product_listing += weight;

      evidence.push({
        signal: 'product_listing_region',
        weight,
        value: listingRegions.length,
        explanation: 'Page contains a repeated product/listing grid.',
      });
    }

    if (tableRegions.length > 0) {
      const weight = 0.08;
      scores.dashboard += weight;

      evidence.push({
        signal: 'table_region',
        weight,
        value: tableRegions.length,
        explanation: 'Page contains one or more table-like regions.',
      });
    }

    if (navigationRegions.length >= 2) {
      const weight = 0.05;
      scores.landing_page += weight;

      evidence.push({
        signal: 'multiple_navigation_regions',
        weight,
        value: navigationRegions.length,
        explanation: 'Multiple navigation regions suggest a marketing or landing page.',
      });
    }
  }

  private rank(
    scores: Record<PageType, number>
  ): Array<{ pageType: PageType; score: number }> {
    return Object.entries(scores)
      .map(([pageType, score]) => ({
        pageType: pageType as PageType,
        score: clamp(score),
      }))
      .sort((a, b) => b.score - a.score);
  }

  private getPrimaryDetection(
    candidates: DetectionCandidate[]
  ): PatternType | undefined {
    if (candidates.length === 0) {
      return undefined;
    }

    return [...candidates].sort((a, b) => b.score - a.score)[0].kind;
  }

  private createEmptyScores(): Record<PageType, number> {
    return {
      article: 0,
      blog_index: 0,
      news_article: 0,
      product_detail: 0,
      product_listing: 0,
      search_results: 0,
      ai_chat: 0,
      documentation: 0,
      dashboard: 0,
      login: 0,
      landing_page: 0,
      forum_thread: 0,
      unknown: 0.05,
    };
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
