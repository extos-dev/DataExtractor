import {
  DetectionCandidate,
  DetectionContext,
  PatternType,
} from '../detection/types';

const SPECIFICITY: Record<PatternType, number> = {
  product: 0.95,
  product_listing: 0.9,
  ai_chat: 0.9,
  article: 0.85,
  table: 0.8,
  form: 0.7,
  breadcrumb: 0.65,
  media: 0.6,
  list: 0.55,
  blog_index: 0.5,
  navigation: 0.5,
  generic: 0.1,
  input: 0.6,
  composer: 0.75,
  bar: 0.45,
  panel: 0.5,
  action: 0.4,
  text: 0.35,
};

export class RegionArbiter {
  select(
    candidates: DetectionCandidate[],
    _context: DetectionContext
  ): DetectionCandidate[] {
    const sorted = [...candidates].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const specificityDelta = SPECIFICITY[b.kind] - SPECIFICITY[a.kind];

      if (Math.abs(specificityDelta) > 0.001) {
        return specificityDelta;
      }

      return 0;
    });

    const selected: DetectionCandidate[] = [];

    for (const candidate of sorted) {
      const conflicts = selected.some((existing) =>
        this.overlaps(existing.element, candidate.element)
      );

      if (conflicts) {
        continue;
      }

      selected.push(candidate);
    }

    return selected;
  }

  private overlaps(a: Element, b: Element): boolean {
    return a === b || a.contains(b) || b.contains(a);
  }
}
