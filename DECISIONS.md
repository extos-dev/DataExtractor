# Decisions Log

## 2026-10-25: Scoring pipeline over selector matching
- Why: Selector-first matching fails on modern frameworks; multi-channel evidence is robust.
- Key design: Detectors return DetectionCandidate[] with scores; RegionArbiter resolves overlaps.
- Reference: Mozilla Readability, DOM-distiller.

## 2026-10-25: Library-first identity
- Why: Engine reusable outside extension (Node scripts, other browsers).
- Trade-off: Extension consumes core as dependency.

## 2026-10-25: Testing strategy
- Unit: vitest + happy-dom for logic (no layout).
- Integration: Playwright for real pages.
- Performance: benchmark script for 10k-node DOM.

## 2026-10-25: DomNormalizer uses snapshot (no live mutation)
- Why: Extension side panel must not mutate page DOM.

## 2026-10-25: Rich surface detection added
- Extended region/block kinds and added SurfaceDetector for inputs, composers, bars, panels, actions, text, lists, nav, breadcrumbs, forms, media.
