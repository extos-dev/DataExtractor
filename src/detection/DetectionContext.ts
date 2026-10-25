import { DomNormalizer } from '../dom/DomNormalizer';
import { BlockSegmenter } from '../dom/BlockSegmenter';
import { RegionGrouper } from '../dom/RegionGrouper';

import {
  DetectionContext,
  DetectionOptions,
  PageMetadata,
} from './types';

export const DEFAULT_DETECTION_OPTIONS: Required<DetectionOptions> = {
  includeHidden: false,
  includeNavigation: true,
  includeBoilerplate: true,
  minConfidence: 0.3,
  maxCandidatesPerDetector: 50,
};

export class ContextBuilder {
  private readonly options: Required<DetectionOptions>;

  private readonly normalizer: DomNormalizer;
  private readonly segmenter: BlockSegmenter;
  private readonly grouper: RegionGrouper;

  constructor(
    options: DetectionOptions = {},
    segmenterOptions = {},
    grouperOptions = {}
  ) {
    this.options = {
      ...DEFAULT_DETECTION_OPTIONS,
      ...options,
    };

    this.normalizer = new DomNormalizer({
      removeHidden: !this.options.includeHidden,
    });

    this.segmenter = new BlockSegmenter(segmenterOptions);
    this.grouper = new RegionGrouper(grouperOptions);
  }

  async build(sourceRoot: ParentNode): Promise<DetectionContext> {
    const normalized = this.normalizer.normalize(sourceRoot);
    const blocks = this.segmenter.segment(normalized);
    const regions = this.grouper.group(blocks.blocks, normalized.nodeById);

    const page = await this.extractPageMetadata(sourceRoot, normalized);

    return {
      sourceRoot,
      normalized,
      blocks,
      regions,
      page,
      options: this.options,

      getRegion: (kind) => regions.regions.filter((region) => region.kind === kind),

      getBlocks: (kind) => blocks.blocks.filter((block) => block.kind === kind),

      getNode: (nodeId: string) => normalized.nodeById.get(nodeId),

      hasJsonLdType: (type: string) =>
        page.jsonLdTypes.some(
          (candidate) => candidate.toLowerCase() === type.toLowerCase()
        ),
    };
  }

  private async extractPageMetadata(
    sourceRoot: ParentNode,
    normalized: ReturnType<DomNormalizer['normalize']>
  ): Promise<PageMetadata> {
    const doc =
      sourceRoot instanceof Document ? sourceRoot : sourceRoot.ownerDocument;

    const location =
      typeof window !== 'undefined' ? window.location : undefined;

    const url = location?.href ?? '';
    const hostname = location?.hostname ?? '';
    const pathname = location?.pathname ?? '';

    const meta = (name: string): string | undefined => {
      if (!doc) return undefined;
      return (
        doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
        doc.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ??
        undefined
      );
    };

    const openGraph: Record<string, string> = {};

    if (doc) {
      for (const element of Array.from(
        doc.querySelectorAll('meta[property^="og:"]')
      )) {
        const property = element.getAttribute('property');
        const content = element.getAttribute('content');

        if (property && content) {
          openGraph[property] = content;
        }
      }
    }

    return {
      url,
      hostname,
      pathname,
      title: doc?.title ?? undefined,
      description: meta('description'),
      lang: doc?.documentElement.getAttribute('lang') ?? undefined,
      canonicalUrl:
        doc?.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
        undefined,
      openGraph,
      jsonLd: normalized.jsonLd,
      jsonLdTypes: this.collectJsonLdTypes(normalized.jsonLd),
    };
  }

  private collectJsonLdTypes(jsonLd: unknown[]): string[] {
    const types: string[] = [];

    for (const item of jsonLd) {
      this.walkJsonLd(item, types);
    }

    return Array.from(new Set(types));
  }

  private walkJsonLd(value: unknown, output: string[]): void {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.walkJsonLd(item, output);
      }
      return;
    }

    const record = value as Record<string, unknown>;
    const type = record['@type'];

    if (typeof type === 'string') {
      output.push(type);
    } else if (Array.isArray(type)) {
      for (const item of type) {
        if (typeof item === 'string') output.push(item);
      }
    }

    for (const child of Object.values(record)) {
      this.walkJsonLd(child, output);
    }
  }
}
