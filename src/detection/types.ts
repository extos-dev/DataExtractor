import {
  NormalizationResult,
  NormalizedDomNode,
} from '../dom/types';
import {
  BlockCandidate,
  SegmentationResult,
  BlockKind,
} from '../dom/blockTypes';
import {
  RegionCandidate,
  RegionGroupingResult,
  RegionKind,
} from '../dom/regionTypes';

export type PatternType =
  | 'article'
  | 'blog_index'
  | 'product'
  | 'product_listing'
  | 'record_list'
  | 'ai_chat'
  | 'table'
  | 'list'
  | 'input'
  | 'composer'
  | 'bar'
  | 'panel'
  | 'action'
  | 'text'
  | 'navigation'
  | 'breadcrumb'
  | 'form'
  | 'media'
  | 'generic';

export interface PageMetadata {
  url: string;
  hostname: string;
  pathname: string;
  title?: string;
  description?: string;
  lang?: string;
  canonicalUrl?: string;
  openGraph?: Record<string, string>;
  jsonLd: unknown[];
  jsonLdTypes: string[];
}

export interface DetectionContext {
  sourceRoot: ParentNode;
  normalized: NormalizationResult;
  blocks: SegmentationResult;
  regions: RegionGroupingResult;
  page: PageMetadata;
  options: Required<DetectionOptions>;

  getRegion(kind: RegionKind): RegionCandidate[];
  getBlocks(kind: BlockKind): BlockCandidate[];
  getNode(nodeId: string): NormalizedDomNode | undefined;
  hasJsonLdType(type: string): boolean;
}

export interface DetectionOptions {
  includeHidden?: boolean;
  includeNavigation?: boolean;
  includeBoilerplate?: boolean;
  minConfidence?: number;
  maxCandidatesPerDetector?: number;
}

export interface Evidence {
  signal: string;
  weight: number;
  value: unknown;
  explanation: string;
}

export interface FieldCandidate {
  value: unknown;
  confidence: number;
  source: 'json-ld' | 'semantic-html' | 'dom-pattern' | 'visual' | 'user-rule';
  selector?: string;
  evidence?: Evidence[];
}

export interface DetectionCandidate {
  detectorId: string;
  kind: PatternType;
  regionId?: string;
  nodeId: string;
  element: Element;

  score: number;
  confidence: number;

  evidence: Evidence[];
  fields: Record<string, FieldCandidate>;
  metadata: Record<string, unknown>;
}

export interface DetectorPlugin {
  id: string;
  kinds: PatternType[];
  version: string;

  applies(context: DetectionContext): boolean;
  detect(context: DetectionContext): DetectionCandidate[];
}
