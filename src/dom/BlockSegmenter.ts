import { NormalizedDomNode, NormalizationResult } from './types';
import { BlockCandidate, BlockKind, SegmentationResult } from './blockTypes';

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const LIST_TAGS = new Set(['UL', 'OL', 'DL']);
const TABLE_TAGS = new Set(['TABLE']);
const MEDIA_TAGS = new Set(['FIGURE', 'PICTURE', 'VIDEO', 'AUDIO']);
const NAV_TAGS = new Set(['NAV', 'HEADER', 'FOOTER']);
const FORM_TAGS = new Set(['FORM']);

const CHAT_ROLE_PATTERNS = [
  /data-message-role/i,
  /data-role/i,
  /message-role/i,
  /chat-message/i,
  /conversation-turn/i,
  /role=["']?(user|assistant|ai|human|bot)/i,
];

const CARD_CLASS_PATTERNS = [
  /card/i,
  /product/i,
  /listing/i,
  /result/i,
  /item/i,
  /tile/i,
  /post/i,
  /entry/i,
];

export interface BlockSegmenterOptions {
  minParagraphWords?: number;
  minListItems?: number;
  minTableRows?: number;
  minCardGridItems?: number;
  maxBlocks?: number;
}

export const DEFAULT_BLOCK_SEGMENTER_OPTIONS: Required<BlockSegmenterOptions> = {
  minParagraphWords: 8,
  minListItems: 2,
  minTableRows: 2,
  minCardGridItems: 3,
  maxBlocks: 800,
};

export class BlockSegmenter {
  private readonly options: Required<BlockSegmenterOptions>;

  private blockIdCounter = 0;
  private blocks: BlockCandidate[] = [];

  constructor(options: BlockSegmenterOptions = {}) {
    this.options = { ...DEFAULT_BLOCK_SEGMENTER_OPTIONS, ...options };
  }

  segment(normalized: NormalizationResult): SegmentationResult {
    this.blockIdCounter = 0;
    this.blocks = [];

    this.walk(normalized.root, 0);

    const byKind = {} as Record<BlockKind, number>;
    for (const block of this.blocks) {
      byKind[block.kind] = (byKind[block.kind] ?? 0) + 1;
    }

    const blocksByNodeId = new Map<string, BlockCandidate[]>();
    for (const block of this.blocks) {
      const existing = blocksByNodeId.get(block.nodeId) ?? [];
      existing.push(block);
      blocksByNodeId.set(block.nodeId, existing);
    }

    return {
      blocks: this.blocks,
      blocksByNodeId,
      stats: {
        totalBlocks: this.blocks.length,
        byKind,
      },
    };
  }

  private walk(node: NormalizedDomNode, depth: number): void {
    if (this.blocks.length >= this.options.maxBlocks) {
      return;
    }

    if (node.features.visibility !== 'hidden') {
      const block = this.classify(node);
      if (block) {
        this.blocks.push(block);
      }
    }

    for (const child of node.children) {
      this.walk(child, depth + 1);
    }
  }

  private classify(node: NormalizedDomNode): BlockCandidate | null {
    const element = node.element;
    const tag = element.tagName.toUpperCase();
    const role = node.features.role?.toLowerCase();

    if (HEADING_TAGS.has(tag) || role === 'heading') {
      return this.createBlock(node, 'heading', {
        level: this.getHeadingLevel(element),
        text: node.features.text,
      });
    }

    if (TABLE_TAGS.has(tag) || role === 'table' || role === 'grid') {
      return this.classifyTable(node);
    }

    if (LIST_TAGS.has(tag) || role === 'list') {
      return this.classifyList(node);
    }

    if (FORM_TAGS.has(tag) || role === 'form') {
      return this.createBlock(node, 'form', {
        inputCount: node.features.inputCount,
        buttonCount: node.features.buttonCount,
      });
    }

    if (MEDIA_TAGS.has(tag)) {
      return this.createBlock(node, 'media', {
        imageCount: node.features.imageCount,
      });
    }

    if (NAV_TAGS.has(tag) || role === 'navigation') {
      return this.classifyNavigation(node);
    }

    if (this.looksLikeChatMessage(node)) {
      return this.classifyChatMessage(node);
    }

    if (tag === 'P' || role === 'paragraph') {
      return this.classifyParagraph(node);
    }

    const cardGrid = this.classifyCardGrid(node);
    if (cardGrid) {
      return cardGrid;
    }

    if (this.looksLikeBreadcrumb(node)) {
      return this.createBlock(node, 'breadcrumb', {
        linkCount: node.features.linkCount,
      });
    }

    return null;
  }

  private classifyParagraph(node: NormalizedDomNode): BlockCandidate | null {
    const words = node.features.wordCount;

    if (words < this.options.minParagraphWords) {
      return null;
    }

    const proseScore = this.scoreProse(node);
    if (proseScore < 0.35) {
      return null;
    }

    return this.createBlock(
      node,
      'paragraph',
      {
        wordCount: words,
        linkDensity: node.features.linkDensity,
        proseScore,
      },
      proseScore
    );
  }

  private classifyList(node: NormalizedDomNode): BlockCandidate | null {
    const items = Array.from(
      node.element.querySelectorAll(':scope > li, :scope > [role=listitem]')
    );

    if (items.length < this.options.minListItems) {
      return null;
    }

    const score =
      0.45 +
      Math.min(0.25, items.length * 0.02) +
      (node.features.linkDensity > 0.5 ? -0.1 : 0.05);

    return this.createBlock(
      node,
      'list',
      {
        itemCount: items.length,
        ordered: node.element.tagName === 'OL',
        linkDensity: node.features.linkDensity,
      },
      clamp(score)
    );
  }

  private classifyTable(node: NormalizedDomNode): BlockCandidate | null {
    const rows = Array.from(
      node.element.querySelectorAll(':scope tr, :scope [role=row]')
    );

    if (rows.length < this.options.minTableRows) {
      return null;
    }

    const headerCount = node.element.querySelectorAll(
      ':scope th, :scope [role=columnheader]'
    ).length;

    const score =
      0.65 +
      Math.min(0.2, rows.length * 0.01) +
      (headerCount > 0 ? 0.1 : 0);

    return this.createBlock(
      node,
      'table',
      {
        rowCount: rows.length,
        headerCount,
        hasHeader: headerCount > 0,
      },
      clamp(score)
    );
  }

  private classifyCardGrid(node: NormalizedDomNode): BlockCandidate | null {
    const children = Array.from(node.element.children);

    if (children.length < this.options.minCardGridItems) {
      return null;
    }

    const fingerprints = children.map((child) =>
      this.createStructuralFingerprint(child)
    );

    const similarity = this.calculateFingerprintSimilarity(fingerprints);
    if (similarity < 0.55) {
      return null;
    }

    const cardish = children.filter((child) =>
      CARD_CLASS_PATTERNS.some((pattern) => pattern.test(child.className))
    ).length;

    const hasImages = node.features.imageCount >= children.length * 0.5;
    const hasLinks = node.features.linkCount >= children.length * 0.5;

    let score = similarity * 0.55;

    if (cardish / children.length > 0.5) {
      score += 0.15;
    }
    if (hasImages) {
      score += 0.12;
    }
    if (hasLinks) {
      score += 0.08;
    }
    if (score < 0.45) {
      return null;
    }

    return this.createBlock(
      node,
      'card_grid',
      {
        itemCount: children.length,
        structuralSimilarity: similarity,
        cardishRatio: cardish / children.length,
        hasImages,
        hasLinks,
      },
      clamp(score)
    );
  }

  private classifyChatMessage(node: NormalizedDomNode): BlockCandidate | null {
    const role = this.inferChatRole(node.element);
    const text = node.features.text;

    if (!text || text.length < 2) {
      return null;
    }

    const score = role ? 0.82 : 0.55;

    return this.createBlock(
      node,
      'chat_message',
      {
        inferredRole: role,
        textLength: text.length,
      },
      clamp(score)
    );
  }

  private classifyNavigation(node: NormalizedDomNode): BlockCandidate | null {
    const linkDensity = node.features.linkDensity;
    const linkCount = node.features.linkCount;

    if (linkCount < 2) {
      return null;
    }

    const score = clamp(
      0.45 + linkDensity * 0.35 + Math.min(0.15, linkCount * 0.01)
    );

    return this.createBlock(
      node,
      'navigation',
      {
        linkCount,
        linkDensity,
      },
      score
    );
  }

  private looksLikeChatMessage(node: NormalizedDomNode): boolean {
    const element = node.element;
    const outer = element.outerHTML.slice(0, 2000);

    return CHAT_ROLE_PATTERNS.some((pattern) => pattern.test(outer));
  }

  private looksLikeBreadcrumb(node: NormalizedDomNode): boolean {
    const element = node.element;
    const classAndId = `${element.id} ${element.className}`.toLowerCase();

    const nameSignal =
      /breadcrumb|breadcrumbs|trail/.test(classAndId) ||
      element.getAttribute('aria-label')?.toLowerCase().includes('breadcrumb');

    const structuralSignal =
      node.features.linkCount >= 2 &&
      node.features.wordCount < 80 &&
      node.features.linkDensity > 0.5;

    return Boolean(nameSignal || structuralSignal);
  }

  private inferChatRole(element: Element): string | null {
    const explicit =
      element.getAttribute('data-message-role') ??
      element.getAttribute('data-role') ??
      element.getAttribute('role');

    if (explicit) {
      const normalized = explicit.toLowerCase();

      if (['user', 'human'].includes(normalized)) {
        return 'user';
      }
      if (['assistant', 'ai', 'bot', 'model'].includes(normalized)) {
        return 'assistant';
      }
    }

    const classAndId = `${element.id} ${element.className}`.toLowerCase();

    if (/user|human|question/.test(classAndId)) {
      return 'user';
    }
    if (/assistant|bot|ai|answer|model/.test(classAndId)) {
      return 'assistant';
    }

    return null;
  }

  private createStructuralFingerprint(element: Element): string {
    const children = Array.from(element.children);

    const childTags = children
      .map((child) => child.tagName.toLowerCase())
      .join('>');

    const classTokens = Array.from(element.classList)
      .map((token) => token.replace(/\d+/g, '#'))
      .sort()
      .slice(0, 6)
      .join('|');

    const imageCount = element.querySelectorAll('img').length;
    const linkCount = element.querySelectorAll('a').length;
    const textLength = (element.textContent ?? '').trim().length;

    return [
      element.tagName,
      childTags,
      classTokens,
      `img:${bucket(imageCount)}`,
      `link:${bucket(linkCount)}`,
      `text:${bucket(textLength)}`,
    ].join('::');
  }

  private calculateFingerprintSimilarity(fingerprints: string[]): number {
    if (fingerprints.length < 2) {
      return 0;
    }

    const counts = new Map<string, number>();
    for (const fingerprint of fingerprints) {
      counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    }

    const dominant = Math.max(...counts.values());
    return dominant / fingerprints.length;
  }

  private scoreProse(node: NormalizedDomNode): number {
    const wordScore = clamp(node.features.wordCount / 80);
    const linkPenalty = 1 - node.features.linkDensity;
    const punctuationBonus = /[.,;:!?]/.test(node.features.text) ? 0.1 : 0;

    return clamp(wordScore * 0.65 + linkPenalty * 0.25 + punctuationBonus);
  }

  private getHeadingLevel(element: Element): number {
    const tag = element.tagName.toUpperCase();

    if (HEADING_TAGS.has(tag)) {
      return Number(tag.slice(1));
    }

    const ariaLevel = element.getAttribute('aria-level');
    return ariaLevel ? Number(ariaLevel) : 1;
  }

  private createBlock(
    node: NormalizedDomNode,
    kind: BlockKind,
    metadata: Record<string, unknown> = {},
    score = 0.5
  ): BlockCandidate {
    this.blockIdCounter++;

    return {
      blockId: `b${this.blockIdCounter}`,
      kind,
      nodeId: node.nodeId,
      element: node.element,
      score: clamp(score),
      confidence: clamp(score),
      text: node.features.text,
      wordCount: node.features.wordCount,
      linkDensity: node.features.linkDensity,
      childCount: node.features.childElementCount,
      itemNodeIds: [],
      metadata,
    };
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function bucket(value: number): string {
  if (value === 0) return '0';
  if (value <= 2) return '1-2';
  if (value <= 5) return '3-5';
  if (value <= 20) return '6-20';
  return '20+';
}
