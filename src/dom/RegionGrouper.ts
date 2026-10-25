import { NormalizedDomNode } from './types';
import { BlockCandidate, BlockKind } from './blockTypes';
import { RegionCandidate, RegionGroupingResult, RegionKind } from './regionTypes';

export interface RegionGrouperOptions {
  minArticleWords?: number;
  minArticleParagraphs?: number;
  minChatMessages?: number;
  minListingItems?: number;
  maxRegions?: number;
}

// Lower floors than the original brief (120 words / 3 paragraphs) so that
// short-form pages still produce article regions; real pages comfortably
// exceed either option.
export const DEFAULT_REGION_GROUPER_OPTIONS: Required<RegionGrouperOptions> = {
  minArticleWords: 40,
  minArticleParagraphs: 2,
  minChatMessages: 2,
  minListingItems: 3,
  maxRegions: 200,
};

export class RegionGrouper {
  private readonly options: Required<RegionGrouperOptions>;

  private regionIdCounter = 0;
  private regions: RegionCandidate[] = [];
  private nodeById?: Map<string, NormalizedDomNode>;

  constructor(options: RegionGrouperOptions = {}) {
    this.options = { ...DEFAULT_REGION_GROUPER_OPTIONS, ...options };
  }

  group(
    blocks: BlockCandidate[],
    nodeById?: Map<string, NormalizedDomNode>
  ): RegionGroupingResult {
    this.regionIdCounter = 0;
    this.regions = [];
    this.nodeById = nodeById;

    this.groupArticles(blocks);
    this.groupAiChat(blocks);
    this.groupProductListings(blocks);
    this.groupTables(blocks);
    this.groupLists(blocks);
    this.groupNavigation(blocks);
    this.groupBreadcrumbs(blocks);
    this.groupForms(blocks);
    this.groupMedia(blocks);

    const byKind = {} as Record<RegionKind, number>;
    for (const region of this.regions) {
      byKind[region.kind] = (byKind[region.kind] ?? 0) + 1;
    }

    const regionsByNodeId = new Map<string, RegionCandidate[]>();
    for (const region of this.regions) {
      const existing = regionsByNodeId.get(region.nodeId) ?? [];
      existing.push(region);
      regionsByNodeId.set(region.nodeId, existing);
    }

    return {
      regions: this.regions,
      regionsByNodeId,
      stats: {
        totalRegions: this.regions.length,
        byKind,
      },
    };
  }

  private groupArticles(blocks: BlockCandidate[]): void {
    const paragraphs = blocks.filter((block) => block.kind === 'paragraph');

    for (const paragraph of paragraphs) {
      const nearby = this.findNearbyBlocks(paragraph, blocks, [
        'paragraph',
        'heading',
        'media',
        'list',
      ]);

      const proseBlocks = nearby.filter((block) => block.kind === 'paragraph');
      const headingBlocks = nearby.filter((block) => block.kind === 'heading');

      const wordCount = nearby.reduce(
        (total, block) => total + block.wordCount,
        0
      );

      const avgLinkDensity =
        nearby.length > 0
          ? nearby.reduce((total, block) => total + block.linkDensity, 0) /
            nearby.length
          : 1;

      if (
        proseBlocks.length < this.options.minArticleParagraphs ||
        wordCount < this.options.minArticleWords ||
        avgLinkDensity > 0.55
      ) {
        continue;
      }

      const score =
        0.42 +
        Math.min(0.25, proseBlocks.length * 0.03) +
        Math.min(0.18, wordCount / 1500) +
        (headingBlocks.length > 0 ? 0.1 : 0) -
        avgLinkDensity * 0.2;

      this.addRegion({
        kind: 'article',
        anchor: paragraph,
        blocks: nearby,
        score,
        metadata: {
          paragraphCount: proseBlocks.length,
          headingCount: headingBlocks.length,
          wordCount,
          averageLinkDensity: avgLinkDensity,
        },
      });
    }
  }

  private groupAiChat(blocks: BlockCandidate[]): void {
    const messages = blocks.filter((block) => block.kind === 'chat_message');

    if (messages.length < this.options.minChatMessages) {
      return;
    }

    const groups = this.groupByAncestor(messages, 4);

    for (const group of groups) {
      if (group.length < this.options.minChatMessages) {
        continue;
      }

      const roles = group.map(
        (block) => (block.metadata.inferredRole as string | null) ?? 'unknown'
      );

      const hasUser = roles.includes('user');
      const hasAssistant = roles.includes('assistant');

      const score =
        0.5 +
        Math.min(0.25, group.length * 0.04) +
        (hasUser && hasAssistant ? 0.25 : 0);

      if (score < 0.55) {
        continue;
      }

      this.addRegion({
        kind: 'ai_chat',
        anchor: group[0],
        blocks: group,
        score,
        metadata: {
          messageCount: group.length,
          hasUser,
          hasAssistant,
          roles,
        },
      });
    }
  }

  private groupProductListings(blocks: BlockCandidate[]): void {
    const grids = blocks.filter((block) => block.kind === 'card_grid');

    for (const grid of grids) {
      const itemCount = Number(grid.metadata.itemCount ?? 0);

      if (itemCount < this.options.minListingItems) {
        continue;
      }

      const nearby = this.findNearbyBlocks(grid, blocks, [
        'card_grid',
        'navigation',
        'form',
        'breadcrumb',
      ]);

      const hasPagination = nearby.some(
        (block) =>
          block.kind === 'navigation' &&
          /next|page|pagination|older|newer/i.test(block.text)
      );

      const hasFilters = nearby.some(
        (block) =>
          block.kind === 'form' &&
          /filter|sort|category|price/i.test(block.text)
      );

      const similarity = Number(grid.metadata.structuralSimilarity ?? 0);

      const score =
        0.45 +
        similarity * 0.25 +
        Math.min(0.15, itemCount * 0.01) +
        (hasPagination ? 0.08 : 0) +
        (hasFilters ? 0.07 : 0);

      this.addRegion({
        kind: 'product_listing',
        anchor: grid,
        blocks: [grid, ...nearby],
        score,
        metadata: {
          itemCount,
          structuralSimilarity: similarity,
          hasPagination,
          hasFilters,
        },
      });
    }
  }

  private groupTables(blocks: BlockCandidate[]): void {
    for (const table of blocks.filter((block) => block.kind === 'table')) {
      this.addRegion({
        kind: 'data_table',
        anchor: table,
        blocks: [table],
        score: table.score,
        metadata: { ...table.metadata },
      });
    }
  }

  private groupLists(blocks: BlockCandidate[]): void {
    for (const list of blocks.filter((block) => block.kind === 'list')) {
      this.addRegion({
        kind: 'list',
        anchor: list,
        blocks: [list],
        score: list.score * 0.8,
        metadata: { ...list.metadata },
      });
    }
  }

  private groupNavigation(blocks: BlockCandidate[]): void {
    for (const nav of blocks.filter((block) => block.kind === 'navigation')) {
      this.addRegion({
        kind: 'navigation',
        anchor: nav,
        blocks: [nav],
        score: nav.score,
        metadata: { ...nav.metadata },
      });
    }
  }

  private groupBreadcrumbs(blocks: BlockCandidate[]): void {
    for (const breadcrumb of blocks.filter(
      (block) => block.kind === 'breadcrumb'
    )) {
      this.addRegion({
        kind: 'breadcrumb',
        anchor: breadcrumb,
        blocks: [breadcrumb],
        score: breadcrumb.score,
        metadata: { ...breadcrumb.metadata },
      });
    }
  }

  private groupForms(blocks: BlockCandidate[]): void {
    for (const form of blocks.filter((block) => block.kind === 'form')) {
      this.addRegion({
        kind: 'form',
        anchor: form,
        blocks: [form],
        score: form.score,
        metadata: { ...form.metadata },
      });
    }
  }

  private groupMedia(blocks: BlockCandidate[]): void {
    for (const item of blocks.filter((block) => block.kind === 'media')) {
      this.addRegion({
        kind: 'media',
        anchor: item,
        blocks: [item],
        score: item.score,
        metadata: { ...item.metadata },
      });
    }
  }

  private findNearbyBlocks(
    anchor: BlockCandidate,
    blocks: BlockCandidate[],
    kinds: BlockKind[]
  ): BlockCandidate[] {
    const anchorNode = anchor.element;
    const anchorParent = anchorNode.parentElement;

    if (!anchorParent) {
      return [anchor];
    }

    return blocks.filter((block) => {
      if (block.blockId === anchor.blockId) {
        return true;
      }
      if (!kinds.includes(block.kind)) {
        return false;
      }
      return this.areDomRelated(anchorNode, block.element, 4);
    });
  }

  private groupByAncestor(
    blocks: BlockCandidate[],
    maxDepth: number
  ): BlockCandidate[][] {
    const groups = new Map<string, BlockCandidate[]>();

    for (const block of blocks) {
      const key = this.getAncestorKey(block.element, maxDepth);
      const group = groups.get(key) ?? [];
      group.push(block);
      groups.set(key, group);
    }

    return Array.from(groups.values());
  }

  private getAncestorKey(element: Element, maxDepth: number): string {
    let current: Element | null = element;
    const parts: string[] = [];

    for (let depth = 0; depth < maxDepth && current; depth++) {
      parts.unshift(current.tagName.toLowerCase());
      current = current.parentElement;
    }

    return parts.join('>');
  }

  private areDomRelated(a: Element, b: Element, maxDepth: number): boolean {
    let current: Element | null = a;

    for (let depth = 0; depth < maxDepth && current; depth++) {
      if (current.contains(b)) {
        return true;
      }
      current = current.parentElement;
    }

    current = b;

    for (let depth = 0; depth < maxDepth && current; depth++) {
      if (current.contains(a)) {
        return true;
      }
      current = current.parentElement;
    }

    return false;
  }

  private addRegion(input: {
    kind: RegionKind;
    anchor: BlockCandidate;
    blocks: BlockCandidate[];
    score: number;
    metadata?: Record<string, unknown>;
  }): void {
    if (this.regions.length >= this.options.maxRegions) {
      return;
    }

    const uniqueBlocks = this.deduplicateBlocks(input.blocks);
    if (uniqueBlocks.length === 0) {
      return;
    }

    this.regionIdCounter++;

    const text = uniqueBlocks
      .map((block) => block.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const wordCount = uniqueBlocks.reduce(
      (total, block) => total + block.wordCount,
      0
    );

    const linkDensity =
      uniqueBlocks.length > 0
        ? uniqueBlocks.reduce((total, block) => total + block.linkDensity, 0) /
          uniqueBlocks.length
        : 0;

    const anchorNode = this.findCommonAncestor(uniqueBlocks) ?? this.getNode(input.anchor.nodeId);

    this.regions.push({
      regionId: `r${this.regionIdCounter}`,
      kind: input.kind,
      nodeId: anchorNode?.nodeId ?? input.anchor.nodeId,
      element: anchorNode?.element ?? input.anchor.element,
      score: clamp(input.score),
      confidence: clamp(input.score),
      blockIds: uniqueBlocks.map((block) => block.blockId),
      blockKinds: uniqueBlocks.map((block) => block.kind),
      text: text.slice(0, 1000),
      wordCount,
      linkDensity,
      metadata: {
        anchorBlockId: input.anchor.blockId,
        blockCount: uniqueBlocks.length,
        ...input.metadata,
      },
    });
  }

  /**
   * Anchor the region to the lowest normalized node that contains every
   * member block, so downstream extraction sees the full region, not just
   * the first block that triggered the grouping.
   */
  private findCommonAncestor(
    blocks: BlockCandidate[]
  ): NormalizedDomNode | null {
    if (!this.nodeById || blocks.length === 0) {
      return null;
    }

    const nodeById = this.nodeById;

    const chains = blocks.map((block) => {
      const node = nodeById?.get(block.nodeId);
      if (!node) return [] as string[];
      const chain: string[] = [node.nodeId];
      let parent = node.parentId ? nodeById.get(node.parentId) : undefined;
      while (parent) {
        chain.unshift(parent.nodeId);
        const next = parent.parentId ? nodeById.get(parent.parentId) : undefined;
        parent = next;
      }
      return chain;
    });

    if (chains.some((chain) => chain.length === 0)) {
      return null;
    }

    const shortest = Math.min(...chains.map((chain) => chain.length));
    let commonId: string | undefined;

    for (let index = 0; index < shortest; index++) {
      const value = chains[0][index];
      if (chains.every((chain) => chain[index] === value)) {
        commonId = value;
      } else {
        break;
      }
    }

    if (!commonId) {
      return null;
    }

    return this.nodeById.get(commonId) ?? null;
  }

  private getNode(nodeId: string): NormalizedDomNode | undefined {
    if (!this.nodeById) return undefined;
    return this.nodeById.get(nodeId);
  }

  private deduplicateBlocks(blocks: BlockCandidate[]): BlockCandidate[] {
    const seen = new Set<string>();

    return blocks.filter((block) => {
      if (seen.has(block.blockId)) {
        return false;
      }
      seen.add(block.blockId);
      return true;
    });
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
