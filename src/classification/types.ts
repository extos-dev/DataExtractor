import { PatternType } from '../detection/types';

export type PageType =
  | 'article'
  | 'blog_index'
  | 'news_article'
  | 'product_detail'
  | 'product_listing'
  | 'search_results'
  | 'ai_chat'
  | 'documentation'
  | 'dashboard'
  | 'login'
  | 'landing_page'
  | 'forum_thread'
  | 'unknown';

export interface PageEvidence {
  signal: string;
  weight: number;
  value: unknown;
  explanation: string;
}

export interface PageClassification {
  pageType: PageType;
  confidence: number;
  scores: Record<PageType, number>;
  evidence: PageEvidence[];
  primaryDetection?: PatternType;
}
