# Decisions Log

## 2026-10-25: Library-first identity
- **Why:** Reusable outside extension; extension is a thin UI consumer.
- **Trade-off:** Separate builds; extension imports core.

## 2026-10-25: Scoring pipeline over selector matching
- **Why:** Selector-first fails on modern frameworks.
- **Key design:** Detectors emit candidates; RegionArbiter resolves overlaps.

## 2026-10-25: Testing strategy
- Unit: vitest + happy-dom. Integration: Playwright on real pages. Benchmarks for 10k nodes.

## 2026-10-25: No live DOM mutation
- **Why:** Side panel runs alongside page; mutating breaks UX.
- **Impl:** Clone + prune; streaming pruner for large pages.
