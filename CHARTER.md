# Project Charter

## Identity
Library-first: `src/` is a framework-agnostic DOM extraction library. The Chrome extension under `extension/` is a separate consumer.

## Non-negotiables
- Detectors return `DetectionCandidate[]` with scores; never mutate live DOM.
- `RegionArbiter` resolves overlaps via non-max suppression.
- Engine output is a distribution of page-type probabilities, not a single label.
- All messaging uses typed protocol in `src/types/messages.ts`.
- Performance budget: detection < 100ms for up to 5000 elements.
