import {
  DetectionCandidate,
  DetectionContext,
  DetectorPlugin,
  Evidence,
  FieldCandidate,
  PatternType,
} from './types';
import { RegionCandidate } from '../dom/regionTypes';

export abstract class BaseDetectorPlugin implements DetectorPlugin {
  abstract readonly id: string;
  abstract readonly kinds: PatternType[];
  abstract readonly version: string;

  applies(_context: DetectionContext): boolean {
    return true;
  }

  abstract detect(context: DetectionContext): DetectionCandidate[];

  protected candidate(input: {
    context: DetectionContext;
    detectorId: string;
    kind: string;
    region?: RegionCandidate;
    element: Element;
    score: number;
    evidence: Evidence[];
    fields?: Record<string, FieldCandidate>;
    metadata?: Record<string, unknown>;
  }): DetectionCandidate {
    return {
      detectorId: input.detectorId,
      kind: input.kind as DetectionCandidate['kind'],
      regionId: input.region?.regionId,
      nodeId: input.region?.nodeId ?? '',
      element: input.element,
      score: clamp(input.score),
      confidence: clamp(input.score),
      evidence: input.evidence,
      fields: input.fields ?? {},
      metadata: input.metadata ?? {},
    };
  }

  protected rankAndLimit(
    candidates: DetectionCandidate[],
    context: DetectionContext
  ): DetectionCandidate[] {
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, context.options.maxCandidatesPerDetector);
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
