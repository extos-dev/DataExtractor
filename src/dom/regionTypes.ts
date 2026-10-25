import { BlockCandidate, BlockKind } from './blockTypes';

export type RegionKind =
  | 'article'
  | 'blog_index'
  | 'product'
  | 'product_listing'
  | 'ai_chat'
  | 'data_table'
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

export interface RegionCandidate {
  regionId: string;
  kind: RegionKind;
  nodeId: string;
  element: Element;

  score: number;
  confidence: number;

  blockIds: string[];
  blockKinds: BlockKind[];

  text: string;
  wordCount: number;
  linkDensity: number;

  metadata: Record<string, unknown>;
}

export interface RegionGroupingResult {
  regions: RegionCandidate[];
  regionsByNodeId: Map<string, RegionCandidate[]>;
  stats: {
    totalRegions: number;
    byKind: Record<RegionKind, number>;
  };
}

export type { BlockCandidate, BlockKind };
