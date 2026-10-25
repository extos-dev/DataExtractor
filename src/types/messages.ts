export type PageType = 'article' | 'product' | 'product_grid' | 'table' | 'ai_chat' | 'unknown';

export interface PageInfo {
  url: string;
  domain: string;
  title: string;
  pageType: PageType;
}

export type ExtensionMessage =
  | { action: 'OPEN_SIDEPANEL' }
  | { action: 'RUN_DETECTION' }
  | { action: 'PAGE_INFO_UPDATED'; payload: { pageInfo: PageInfo; schemas: unknown[] } }
  | { action: 'NODE_SELECTED_IN_PAGE'; payload: unknown };
