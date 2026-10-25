import { BaseDetectorPlugin } from '../DetectorPlugin';
import {
  DetectionCandidate,
  DetectionContext,
  Evidence,
  PatternType,
} from '../types';
import { RegionCandidate } from '../../dom/regionTypes';

const KINDS: PatternType[] = [
  'list',
  'navigation',
  'breadcrumb',
  'form',
  'media',
  'text',
];

export class ContextDetector extends BaseDetectorPlugin {
  readonly id = 'core.context';
  readonly kinds: PatternType[] = KINDS;
  readonly version = '1.0.0';

  applies(context: DetectionContext): boolean {
    return KINDS.some(
      (kind) =>
        context.getRegion(kind as any).length > 0 ||
        context.getBlocks(kind as any).length > 0
    );
  }

  detect(context: DetectionContext): DetectionCandidate[] {
    const candidates: DetectionCandidate[] = [];

    for (const kind of KINDS) {
      const regions = context.getRegion(kind as any);
      for (const region of regions) {
        const candidate = this.buildCandidate(context, kind, region);
        if (candidate) candidates.push(candidate);
      }
    }

    return this.rankAndLimit(candidates, context);
  }

  private buildCandidate(
    context: DetectionContext,
    kind: string,
    region: RegionCandidate
  ): DetectionCandidate | null {
    const evidence: Evidence[] = [
      {
        signal: 'context_region',
        weight: 0.35,
        value: kind,
        explanation: `Detected ${kind} context region.`,
      },
    ];

    let score = region.score || 0.5;
    if (score < context.options.minConfidence) {
      score = Math.max(context.options.minConfidence, 0.4);
    }

    return this.candidate({
      context,
      detectorId: this.id,
      kind: kind as PatternType,
      region,
      element: region.element,
      score,
      evidence,
      fields: {},
      metadata: { surface: kind, ...region.metadata },
    });
  }
}
