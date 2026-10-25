export type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'table'
  | 'card_grid'
  | 'chat_message'
  | 'form'
  | 'media'
  | 'navigation'
  | 'breadcrumb'
  | 'generic';

export interface BlockCandidate {
  blockId: string;
  kind: BlockKind;
  nodeId: string;
  element: Element;
  score: number;
  confidence: number;
  text: string;
  wordCount: number;
  linkDensity: number;
  childCount: number;
  itemNodeIds: string[];
  metadata: Record<string, unknown>;
}

export interface SegmentationResult {
  blocks: BlockCandidate[];
  blocksByNodeId: Map<string, BlockCandidate[]>;
  stats: {
    totalBlocks: number;
    byKind: Record<BlockKind, number>;
  };
}