import { PatternType } from '../detection/types';

export interface ArticleData {
  title?: string;
  author?: string;
  date?: string;
  description?: string;
  paragraphs: string[];
  headings: { level: number; text: string }[];
  images: string[];
}

export interface ProductData {
  title?: string;
  price?: string;
  currency?: string;
  availability?: string;
  sku?: string;
  brand?: string;
  description?: string;
  images: string[];
  rating?: number;
  reviewCount?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'unknown';
  text: string;
}

export interface AiChatData {
  title?: string;
  messages: ChatMessage[];
}

export interface TableData {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface ListData {
  ordered: boolean;
  items: string[];
  itemImages: string[];
}

export type ExtractionData =
  | ArticleData
  | ProductData
  | AiChatData
  | TableData
  | ListData;

export interface ExtractionMappingContext {
  /** The selected detection candidate's element. */
  element: Element;
  /** Page document, when available. */
  document?: Document;
  /** Structured data pulled by ContextBuilder. */
  jsonLd: unknown[];
  /** True when the page carries JSON-LD of this type. */
  hasJsonLdType: (type: string) => boolean;
}

/** Structured record the extension/UI can render or pass to an LLM. */
export interface LlmContextRecord {
  type: string;
  title: string;
  confidence: number;
  data: unknown;
}

export interface ExtractedContent {
  data: ExtractionData;
  markdown?: string;
}

export interface ExtractionResultItem {
  kind: PatternType;
  detectorId: string;
  nodeId: string;
  confidence: number;
  element: Element;
  data: ExtractionData;
  markdown: string;
  llmContext: LlmContextRecord;
}
